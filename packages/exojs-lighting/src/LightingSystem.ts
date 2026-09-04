import { Color, DataTexture, TextureFormat } from '@codexo/exojs';

import type { PointLight } from './PointLight';

/** Construction options for {@link LightingSystem}. */
export interface LightingSystemOptions {
  /**
   * Lights the light texture is sized for. Fixed at construction; lights
   * registered beyond it are ignored by {@link LightingSystem.commit} until a
   * registered one is removed. Defaults to `64`.
   */
  readonly maxLights?: number;
  /**
   * Baseline colour every lit fragment receives regardless of any light, as a
   * multiplier on the albedo (`255` per channel means "unlit areas keep their
   * full albedo"). Stored by reference and re-read on every commit.
   * Defaults to a dim neutral blue-grey.
   */
  readonly ambient?: Color;
}

/** Column 0 of both rows is the header; light `i` occupies column `i + 1`. */
const headerColumns = 1;
const rows = 2;
const channels = 4;

/**
 * Collects {@link PointLight}s and publishes them to shaders as a single
 * floating-point data texture.
 *
 * The texture is `rgba32f`, `maxLights + 1` texels wide and 2 rows tall:
 *
 * | column   | row 0                          | row 1                              |
 * | -------- | ------------------------------ | ---------------------------------- |
 * | `0`      | `(activeLightCount, 0, 0, 0)`  | `(ambientR, ambientG, ambientB, 0)` |
 * | `i + 1`  | `(x, y, radius, intensity)`    | `(r, g, b, height)`                 |
 *
 * Colour channels are normalized to `0..1`. Because the light count and the
 * ambient term travel in the texture as well, a material that samples it needs
 * no per-frame uniform update, and any number of materials can share one
 * system.
 *
 * # Lifecycle
 *
 * `LightingSystem` is a `System`: register it with the registry that
 * ticks *after* the code that moves the lights, so the packed texture describes
 * the frame that is about to be drawn.
 *
 * ```ts
 * const lighting = new LightingSystem({ ambient: new Color(30, 30, 45) });
 *
 * scene.systems.add(lighting); // scene systems update after Scene.update()
 * ```
 *
 * `app.systems` runs its update phase *before* the active scene's, so a system
 * registered there sees lights that scene code has not moved yet. Register on
 * the scene, or call {@link commit} yourself at the point that suits the app.
 *
 * The system owns its light texture and destroys it in {@link destroy}; the
 * lights themselves are plain data and are not owned.
 */
export class LightingSystem {
  /** Baseline colour applied to every lit fragment. Mutable; re-read on each commit. */
  public ambient: Color;

  /** Lights the texture is sized for. */
  public readonly maxLights: number;

  private readonly _lights: PointLight[] = [];
  private readonly _texture: DataTexture<TextureFormat.Rgba32F>;
  private _activeCount = 0;

  public constructor(options: LightingSystemOptions = {}) {
    this.maxLights = options.maxLights ?? 64;
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this._texture = new DataTexture({
      width: this.maxLights + headerColumns,
      height: rows,
      format: TextureFormat.Rgba32F,
    });

    this.commit();
  }

  /**
   * The packed light texture, to be bound as a material texture. Its identity
   * is stable for the system's lifetime.
   */
  public get lightTexture(): DataTexture<TextureFormat.Rgba32F> {
    return this._texture;
  }

  /** Currently registered lights, in registration order. */
  public get lights(): readonly PointLight[] {
    return this._lights;
  }

  /** Lights the last {@link commit} actually published - `min(lights.length, maxLights)`. */
  public get activeLightCount(): number {
    return this._activeCount;
  }

  /** Register a light. Registering the same light twice shades it twice. */
  public add(light: PointLight): this {
    this._lights.push(light);

    return this;
  }

  /** Unregister a light. Returns `false` when it was not registered. */
  public remove(light: PointLight): boolean {
    const index = this._lights.indexOf(light);

    if (index === -1) {
      return false;
    }

    this._lights.splice(index, 1);

    return true;
  }

  /** Unregister every light. */
  public clear(): this {
    this._lights.length = 0;

    return this;
  }

  /**
   * Pack the registered lights and the ambient term into the light texture and
   * mark it for upload.
   *
   * Lights are plain mutable data, so there is nothing to observe: every call
   * rewrites the whole header and light range unconditionally. Surplus lights
   * beyond {@link maxLights} are skipped.
   */
  public commit(): this {
    const buffer = this._texture.buffer;
    const count = Math.min(this._lights.length, this.maxLights);
    const secondRow = this._texture.width * channels;

    buffer[0] = count;
    buffer[1] = 0;
    buffer[2] = 0;
    buffer[3] = 0;
    buffer[secondRow] = this.ambient.r / 255;
    buffer[secondRow + 1] = this.ambient.g / 255;
    buffer[secondRow + 2] = this.ambient.b / 255;
    buffer[secondRow + 3] = 0;

    for (let index = 0; index < count; index++) {
      const light = this._lights[index]!;
      const offset = (index + headerColumns) * channels;

      buffer[offset] = light.x;
      buffer[offset + 1] = light.y;
      buffer[offset + 2] = light.radius;
      buffer[offset + 3] = light.intensity;

      buffer[secondRow + offset] = light.color.r / 255;
      buffer[secondRow + offset + 1] = light.color.g / 255;
      buffer[secondRow + offset + 2] = light.color.b / 255;
      buffer[secondRow + offset + 3] = light.height;
    }

    this._activeCount = count;
    this._texture.commit();

    return this;
  }

  /** `System` update phase - equivalent to {@link commit}. */
  public update(): void {
    this.commit();
  }

  /** Release the light texture. The registered lights are untouched. */
  public destroy(): void {
    this._lights.length = 0;
    this._activeCount = 0;
    this._texture.destroy();
  }
}
