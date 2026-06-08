import type { Color } from '#core/Color';
import type { Cloneable, Destroyable } from '#core/types';
import { clamp } from '#math/utils';
import { DataTexture } from '#rendering/texture/DataTexture';
import type { SamplerOptions } from '#rendering/texture/Sampler';

/** Discriminant identifying the concrete gradient kind (`gradient.type`). */
export type GradientType = 'linear' | 'radial';

export interface GradientStop {
  offset: number;
  color: Color;
}

export interface GradientToTextureOptions {
  readonly format?: 'rgba8' | 'rgba32f';
  readonly samplerOptions?: Partial<SamplerOptions>;
}

interface InternalGradientStop {
  offset: number;
  color: Color;
}

const sortedStopOffset = (left: InternalGradientStop, right: InternalGradientStop): number => left.offset - right.offset;

/**
 * CPU-rasterized gradient base. A {@link Color}-like paint value (not a
 * {@link Drawable}): it owns a normalized list of color stops plus subclass
 * geometry and supports the value-object contract — {@link Gradient.clone},
 * {@link Gradient.copy}, and {@link Gradient.equals}. Stops are cloned on the
 * way in, clamped to `0..1`, and kept sorted by offset.
 *
 * Convert a gradient into a sampleable {@link DataTexture} with
 * {@link Gradient.toTexture}; wrap that texture in a `Sprite`/`Mesh` to draw it.
 */
export abstract class Gradient implements Cloneable, Destroyable {
  /** Concrete gradient kind, e.g. `'linear'` or `'radial'`. */
  public abstract readonly type: GradientType;

  private _stops: InternalGradientStop[];
  private readonly _sample = new Float32Array(4);

  protected constructor(stops: readonly GradientStop[]) {
    this._stops = Gradient._normalizeStops(stops);
  }

  public get stops(): readonly GradientStop[] {
    return this._stops;
  }

  /** Deep-clone into a new instance of the same concrete gradient type. */
  public abstract clone(): this;

  /**
   * Copy every value (stops and geometry) from a same-type `source` into this
   * instance, replacing its current state. Returns `this` for chaining.
   */
  public copy(source: this): this {
    this._stops = source._stops.map(stop => ({ offset: stop.offset, color: stop.color.clone() }));
    this._copyGeometry(source);

    return this;
  }

  /**
   * Structural value equality: same {@link GradientType}, same ordered stops
   * (offset and {@link Color}), and same subclass geometry.
   */
  public equals(other: Gradient): boolean {
    if (this === other) {
      return true;
    }

    if (this.type !== other.type || this._stops.length !== other._stops.length) {
      return false;
    }

    for (let i = 0; i < this._stops.length; i++) {
      const own = this._stops[i];
      const their = other._stops[i];

      if (own.offset !== their.offset || !own.color.equals(their.color)) {
        return false;
      }
    }

    return this._geometryEquals(other);
  }

  public toTexture(width: number, height: number, options?: GradientToTextureOptions & { format?: 'rgba8' }): DataTexture<'rgba8'>;
  public toTexture(width: number, height: number, options: GradientToTextureOptions & { format: 'rgba32f' }): DataTexture<'rgba32f'>;
  public toTexture(width: number, height: number, options: GradientToTextureOptions = {}): DataTexture<'rgba8'> | DataTexture<'rgba32f'> {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('Gradient.toTexture() width/height must be positive integers.');
    }

    if (options.format === 'rgba32f') {
      return this._toRgba32fTexture(width, height, options);
    }

    return this._toRgba8Texture(width, height, options);
  }

  public destroy(): void {
    for (const stop of this._stops) {
      stop.color.destroy();
    }

    this._stops = [];
  }

  protected abstract resolveT(u: number, v: number): number;

  /** Copy the concrete subclass geometry from a same-type `source`. */
  protected abstract _copyGeometry(source: this): void;

  /**
   * Compare the concrete subclass geometry against `other`. Only invoked once
   * {@link Gradient.equals} has confirmed both sides share the same
   * {@link GradientType}, so implementations may narrow `other` accordingly.
   */
  protected abstract _geometryEquals(other: Gradient): boolean;

  /**
   * Shared stop sampling logic ported from the legacy GLSL implementation.
   */
  protected sampleAt(t: number, out: Float32Array): void {
    const clamped = clamp(t, 0, 1);
    const first = this._stops[0];

    let previousOffset = first.offset;
    let previousColor = first.color;

    for (let i = 1; i < this._stops.length; i++) {
      const current = this._stops[i];

      if (clamped <= current.offset) {
        const span = Math.max(current.offset - previousOffset, 0.000001);
        const ratio = clamp((clamped - previousOffset) / span, 0, 1);

        out[0] = previousColor.r / 255 + (current.color.r / 255 - previousColor.r / 255) * ratio;
        out[1] = previousColor.g / 255 + (current.color.g / 255 - previousColor.g / 255) * ratio;
        out[2] = previousColor.b / 255 + (current.color.b / 255 - previousColor.b / 255) * ratio;
        out[3] = previousColor.a + (current.color.a - previousColor.a) * ratio;

        return;
      }

      previousOffset = current.offset;
      previousColor = current.color;
    }

    out[0] = previousColor.r / 255;
    out[1] = previousColor.g / 255;
    out[2] = previousColor.b / 255;
    out[3] = previousColor.a;
  }

  private static _normalizeStops(stops: readonly GradientStop[]): InternalGradientStop[] {
    if (stops.length < 2) {
      throw new Error('Gradient requires at least 2 color stops.');
    }

    return stops
      .map(stop => {
        if (!Number.isFinite(stop.offset)) {
          throw new Error('Gradient stop offset must be a finite number.');
        }

        return { offset: clamp(stop.offset, 0, 1), color: stop.color.clone() };
      })
      .sort(sortedStopOffset);
  }

  private _toRgba8Texture(width: number, height: number, options: GradientToTextureOptions): DataTexture<'rgba8'> {
    const texture = new DataTexture({
      width,
      height,
      format: 'rgba8',
      samplerOptions: options.samplerOptions,
    });
    const buffer = texture.buffer;

    let offset = 0;

    for (let y = 0; y < height; y++) {
      const v = height === 1 ? 0 : y / (height - 1);

      for (let x = 0; x < width; x++) {
        const u = width === 1 ? 0 : x / (width - 1);

        this.sampleAt(this.resolveT(u, v), this._sample);

        buffer[offset] = toUnorm8(this._sample[0]);
        buffer[offset + 1] = toUnorm8(this._sample[1]);
        buffer[offset + 2] = toUnorm8(this._sample[2]);
        buffer[offset + 3] = toUnorm8(this._sample[3]);
        offset += 4;
      }
    }

    texture.commit();

    return texture;
  }

  private _toRgba32fTexture(width: number, height: number, options: GradientToTextureOptions): DataTexture<'rgba32f'> {
    const texture = new DataTexture({
      width,
      height,
      format: 'rgba32f',
      samplerOptions: options.samplerOptions,
    });
    const buffer = texture.buffer;

    let offset = 0;

    for (let y = 0; y < height; y++) {
      const v = height === 1 ? 0 : y / (height - 1);

      for (let x = 0; x < width; x++) {
        const u = width === 1 ? 0 : x / (width - 1);

        this.sampleAt(this.resolveT(u, v), this._sample);

        buffer[offset] = this._sample[0];
        buffer[offset + 1] = this._sample[1];
        buffer[offset + 2] = this._sample[2];
        buffer[offset + 3] = this._sample[3];
        offset += 4;
      }
    }

    texture.commit();

    return texture;
  }
}

const toUnorm8 = (value: number): number => (clamp(value, 0, 1) * 255 + 0.5) | 0;
