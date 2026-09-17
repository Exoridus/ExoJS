import { type Color, DataTexture, TextureFormat } from '@codexo/exojs';

import type { LightingQuality } from '../Lighting';
import { type Light } from '../lights/Light';
import { PointLight } from '../lights/PointLight';
import { SpotLight } from '../lights/SpotLight';
import type { LightingBackend } from './LightingBackend';

/** Column 0 of every row is the header; light `i` occupies column `i + 1`. */
const headerColumns = 1;
const rows = 3;
const channels = 4;
/** Cone cosine that no direction can fail, which is how a point light says "no cone". */
const noCone = -1;

const scratchPosition = { x: 0, y: 0 };
const scratchDirection = { x: 0, y: 0 };

/** Construction options for {@link ForwardBackend}. */
export interface ForwardBackendOptions {
  /** Lights the texture is sized for. Lights beyond it are skipped. */
  readonly maxLights: number;
}

/**
 * Shades inside the sprite shader, against one floating-point data texture.
 *
 * The texture is `rgba32f`, `maxLights + 1` texels wide and 3 rows tall:
 *
 * | column  | row 0                       | row 1                      | row 2                              |
 * | ------- | --------------------------- | -------------------------- | ---------------------------------- |
 * | `0`     | `(lightCount, 0, 0, 0)`     | `(ambientR, G, B, 0)`      | unused                             |
 * | `i + 1` | `(x, y, radius, intensity)` | `(r, g, b, height)`        | `(dirX, dirY, cosOuter, cosInner)` |
 *
 * Colour channels are normalized to `0..1`. Because the light count and the
 * ambient term travel in the texture, a material that samples it needs no
 * per-frame uniform update, and any number of materials share one system.
 *
 * A point light writes `cosOuter = cosInner = -1`, which no direction fails, so
 * the shader applies the same cone term to every light and never branches.
 *
 * The cap is the price of shading in one draw: every lit fragment walks every
 * light. It is the floor renderer, for hosts where a G-buffer is not worth its
 * bandwidth.
 * @internal
 */
export class ForwardBackend implements LightingBackend {
  public readonly quality: LightingQuality = 'forward';

  /** Lights the texture is sized for. */
  public readonly maxLights: number;

  private readonly _texture: DataTexture<TextureFormat.Rgba32F>;
  private _activeCount = 0;

  public constructor(options: ForwardBackendOptions) {
    this.maxLights = options.maxLights;
    this._texture = new DataTexture({
      width: this.maxLights + headerColumns,
      height: rows,
      format: TextureFormat.Rgba32F,
    });
  }

  /** The packed light texture, bound as a material texture. Stable for this backend's lifetime. */
  public get lightTexture(): DataTexture<TextureFormat.Rgba32F> {
    return this._texture;
  }

  /** Lights the last publish actually wrote - disabled ones and the surplus beyond {@link maxLights} are skipped. */
  public get activeLightCount(): number {
    return this._activeCount;
  }

  public publish(lights: readonly Light[], ambient: Color): void {
    const buffer = this._texture.buffer;
    const rowStride = this._texture.width * channels;
    const secondRow = rowStride;
    const thirdRow = rowStride * 2;

    buffer[1] = 0;
    buffer[2] = 0;
    buffer[3] = 0;
    buffer[secondRow] = ambient.r / 255;
    buffer[secondRow + 1] = ambient.g / 255;
    buffer[secondRow + 2] = ambient.b / 255;
    buffer[secondRow + 3] = 0;

    let written = 0;

    for (const light of lights) {
      if (written >= this.maxLights) {
        break;
      }

      if (!light.enabled || light.intensity <= 0) {
        continue;
      }

      const offset = (written + headerColumns) * channels;

      light.getWorldPosition(scratchPosition);
      buffer[offset] = scratchPosition.x;
      buffer[offset + 1] = scratchPosition.y;
      buffer[offset + 2] = radiusOf(light);
      buffer[offset + 3] = light.intensity;

      buffer[secondRow + offset] = light.color.r / 255;
      buffer[secondRow + offset + 1] = light.color.g / 255;
      buffer[secondRow + offset + 2] = light.color.b / 255;
      buffer[secondRow + offset + 3] = heightOf(light);

      writeCone(buffer, thirdRow + offset, light);
      written++;
    }

    buffer[0] = written;
    this._activeCount = written;
    this._texture.commit();
  }

  public destroy(): void {
    this._activeCount = 0;
    this._texture.destroy();
  }
}

/** A light shape this renderer cannot express contributes nothing rather than shading wrongly. */
const radiusOf = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight) {
    return light.radius;
  }

  return 0;
};

const heightOf = (light: Light): number => {
  if (light instanceof PointLight || light instanceof SpotLight) {
    return light.height;
  }

  return 0;
};

const writeCone = (buffer: Float32Array, offset: number, light: Light): void => {
  if (!(light instanceof SpotLight)) {
    buffer[offset] = 0;
    buffer[offset + 1] = 0;
    buffer[offset + 2] = noCone;
    buffer[offset + 3] = noCone;

    return;
  }

  light.getWorldDirection(scratchDirection);

  const outer = Math.cos((Math.max(0, Math.min(90, light.angle)) * Math.PI) / 180);
  // The inner edge sits where the fade begins, so softness 0 collapses the two
  // and the shader's smoothstep degenerates to a hard edge on its own.
  const inner = Math.cos((Math.max(0, Math.min(90, light.angle * (1 - clamp01(light.softness)))) * Math.PI) / 180);

  buffer[offset] = scratchDirection.x;
  buffer[offset + 1] = scratchDirection.y;
  buffer[offset + 2] = outer;
  buffer[offset + 3] = inner;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
