import { type Application, type Color, DataTexture, type Filter, FilterPass, TextureFormat } from '@codexo/exojs';

import type { LightingDebugView, LightingQuality } from '../Lighting';
import { type Light } from '../lights/Light';
import { lightHeight, lightRadius } from '../lights/reach';
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
  /**
   * Filters over the finished frame, in order. Empty installs no pass at all,
   * which is what keeps this renderer's "no extra pass" claim true for every
   * scene that does not ask for one.
   */
  readonly post: readonly Filter[];
  /** The application whose frame the filters run on. Only read when `post` has filters. */
  readonly app: Application | null;
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
 *
 * A `post` chain is the one thing that puts a pass in the frame slot here, and
 * it reads the shaded frame rather than a light field of its own: there is no
 * intermediate to read, because the light was folded into the albedo inside the
 * sprite stage.
 * @internal
 */
export class ForwardBackend implements LightingBackend {
  public readonly quality: LightingQuality = 'forward';

  /** Ignored: this renderer shades inside the sprite shader and has no intermediate to show. */
  public debug: LightingDebugView = null;

  /** Shading happens inside the sprite fragment stage, which has no light field to fold a shadow term into. */
  public readonly castsShadows = false;

  /** Shading lands straight in the frame, so a lit fragment clamps where every fragment does. */
  public readonly hdr = false;

  /** Lights the texture is sized for. */
  public readonly maxLights: number;

  private readonly _texture: DataTexture<TextureFormat.Rgba32F>;
  private readonly _app: Application | null = null;
  private readonly _postPass: FilterPass | null = null;
  private _activeCount = 0;

  public constructor(options: ForwardBackendOptions) {
    this.maxLights = options.maxLights;
    this._texture = new DataTexture({
      width: this.maxLights + headerColumns,
      height: rows,
      format: TextureFormat.Rgba32F,
    });

    // Shading happens inside the sprite stage here, so there is no composite to
    // filter: the chain reads the finished frame, exactly as a caller writing
    // the pass by hand would. The frame slot redirects the frame into a texture
    // on its own as soon as it holds a pass.
    if (options.post.length > 0 && options.app !== null) {
      this._app = options.app;
      this._postPass = new FilterPass(options.app.frameTexture, options.post, { label: 'lighting:post' });
      options.app.framePasses.addPass(this._postPass);
    }
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
      buffer[offset + 2] = lightRadius(light);
      buffer[offset + 3] = light.intensity;

      buffer[secondRow + offset] = light.color.r / 255;
      buffer[secondRow + offset + 1] = light.color.g / 255;
      buffer[secondRow + offset + 2] = light.color.b / 255;
      buffer[secondRow + offset + 3] = lightHeight(light);

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

    if (this._postPass !== null) {
      this._app?.framePasses.removePass(this._postPass);
      // The filters are the caller's; the pass only releases what it allocated.
      this._postPass.destroy();
    }
  }
}

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
  // The inner edge sits where the fade begins, so a cone softness of 0 collapses the two
  // and the shader's smoothstep degenerates to a hard edge on its own.
  const inner = Math.cos((Math.max(0, Math.min(90, light.angle * (1 - clamp01(light.coneSoftness)))) * Math.PI) / 180);

  buffer[offset] = scratchDirection.x;
  buffer[offset + 1] = scratchDirection.y;
  buffer[offset + 2] = outer;
  buffer[offset + 3] = inner;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
