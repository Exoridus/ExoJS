import type { SamplerOptions } from '@/rendering/texture/Sampler';
import { Texture } from '@/rendering/texture/Texture';
import { ScaleModes, WrapModes } from '@/rendering/types';

/**
 * Pixel format for {@link DataTexture}.
 *
 * - `r8`     — single-channel 8-bit unsigned. Buffer is `Uint8Array`. 1 byte/pixel.
 * - `r32f`   — single-channel 32-bit float. Buffer is `Float32Array`. 4 bytes/pixel.
 * - `rgba8`  — 4-channel 8-bit unsigned. Buffer is `Uint8Array`. 4 bytes/pixel.
 * - `rgba32f`— 4-channel 32-bit float. Buffer is `Float32Array`. 16 bytes/pixel.
 *
 * Float formats are core in WebGL2 and WebGPU; no extension probe required.
 */
export type DataTextureFormat = 'r8' | 'r32f' | 'rgba8' | 'rgba32f';

/** Buffer typed-array kind for a given format. */
export type DataTextureBuffer<F extends DataTextureFormat = DataTextureFormat> = F extends 'r8' | 'rgba8'
  ? Uint8Array
  : F extends 'r32f' | 'rgba32f'
    ? Float32Array
    : Uint8Array | Float32Array;

const channelsForFormat: Record<DataTextureFormat, number> = {
  r8: 1,
  r32f: 1,
  rgba8: 4,
  rgba32f: 4,
};

const bytesPerChannelForFormat: Record<DataTextureFormat, number> = {
  r8: 1,
  r32f: 4,
  rgba8: 1,
  rgba32f: 4,
};

/**
 * A region of the buffer marked for upload by the next backend sync.
 * Bounds are pixel coordinates with origin at the top-left.
 */
export interface DataTextureDirtyRegion {
  /** Whether the whole texture should be re-uploaded (covers initial alloc and full {@link DataTexture.commit}). */
  readonly full: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Construction options for {@link DataTexture}. */
export interface DataTextureOptions {
  readonly width: number;
  readonly height: number;
  readonly format: DataTextureFormat;
  /**
   * Optional external buffer. When omitted, an internal buffer is allocated
   * sized exactly `width * height * channels`. When supplied:
   * - A `Uint8Array` requires an 8-bit format (`r8`/`rgba8`).
   * - A `Float32Array` requires a 32-bit float format (`r32f`/`rgba32f`).
   * - An `ArrayBuffer` is accepted for any format and wrapped in the
   *   appropriate typed-array kind (zero-copy view, no allocation).
   *
   * In all cases the byte length must equal `width * height * channels * bytesPerChannel`,
   * otherwise the constructor throws.
   */
  readonly data?: Uint8Array | Float32Array | ArrayBuffer;
  /** Sampler overrides; defaults to nearest filtering and clamp-to-edge wrapping. */
  readonly samplerOptions?: Partial<SamplerOptions>;
}

/**
 * A 2D texture whose pixels live in a CPU-side typed array. Mutate the
 * `buffer` directly and call {@link commit} to upload the whole array, or
 * {@link commitRect} to upload a sub-region (cheaper for ring-buffer
 * patterns like spectrograms).
 *
 * `DataTexture` extends {@link Texture}, so any API that accepts a
 * `Texture` (filter uniforms, mesh textures, custom shader uniforms)
 * accepts a `DataTexture` unchanged.
 *
 * # Default sampler
 *
 * `DataTexture` defaults to nearest filtering, clamp-to-edge wrap, no mip
 * generation, and no premultiply. These match the typical "raw data
 * lookup" use case where bilinear filtering would corrupt sampled values
 * (e.g. spectrum bins sampled by index).
 *
 * # Bring-your-own buffer
 *
 * Pass `data` in options to share an external buffer. Useful for:
 * - SharedArrayBuffer + Worker pipelines (audio DSP off the main thread)
 * - Buffer pooling across many small textures
 * - Interop with WebAssembly memory or other APIs that produce typed-array views
 *
 * The buffer reference is fixed for the lifetime of the texture (the
 * `buffer` property is `readonly`); only its contents may be mutated.
 *
 * # Format / buffer correspondence
 *
 * The TypeScript type system narrows `buffer` based on `format`:
 *
 *   const r8 = new DataTexture({ width: 256, height: 1, format: 'r8' });
 *   r8.buffer  // Uint8Array
 *
 *   const r32f = new DataTexture({ width: 256, height: 1, format: 'r32f' });
 *   r32f.buffer  // Float32Array
 */
export class DataTexture<F extends DataTextureFormat = DataTextureFormat> extends Texture {
  public static override defaultSamplerOptions: SamplerOptions = {
    scaleMode: ScaleModes.Nearest,
    wrapMode: WrapModes.ClampToEdge,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
  };

  public readonly format: F;
  public readonly buffer: DataTextureBuffer<F>;

  private _dirty: DataTextureDirtyRegion | null = null;

  public constructor(options: DataTextureOptions & { format: F }) {
    super(null, { ...DataTexture.defaultSamplerOptions, ...options.samplerOptions });

    const { width, height, format, data } = options;

    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`DataTexture width must be a positive integer (got ${width}).`);
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`DataTexture height must be a positive integer (got ${height}).`);
    }

    const channels = channelsForFormat[format];
    const bpc = bytesPerChannelForFormat[format];
    const expectedBytes = width * height * channels * bpc;

    let buffer: Uint8Array | Float32Array;

    if (data === undefined) {
      buffer = isFloatFormat(format) ? new Float32Array(expectedBytes / 4) : new Uint8Array(expectedBytes);
    } else if (data instanceof ArrayBuffer) {
      if (data.byteLength !== expectedBytes) {
        throw new Error(
          `DataTexture data byteLength ${data.byteLength} does not match ${width}x${height} ${format} (${expectedBytes} bytes expected).`,
        );
      }
      buffer = isFloatFormat(format) ? new Float32Array(data) : new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      if (isFloatFormat(format)) {
        throw new Error(`DataTexture format '${format}' requires a Float32Array, got Uint8Array.`);
      }
      if (data.byteLength !== expectedBytes) {
        throw new Error(`DataTexture Uint8Array length ${data.length} does not match ${width}x${height} ${format} (${expectedBytes} expected).`);
      }
      buffer = data;
    } else {
      // Float32Array
      if (!isFloatFormat(format)) {
        throw new Error(`DataTexture format '${format}' requires a Uint8Array, got Float32Array.`);
      }
      if (data.byteLength !== expectedBytes) {
        throw new Error(
          `DataTexture Float32Array byteLength ${data.byteLength} does not match ${width}x${height} ${format} (${expectedBytes} expected).`,
        );
      }
      buffer = data;
    }

    this.format = format;
    this.buffer = buffer as DataTextureBuffer<F>;
    this.setSize(width, height);

    // Mark fully dirty so the first sync uploads the whole buffer.
    this._dirty = { full: true, x: 0, y: 0, width, height };
  }

  /**
   * Mark the entire buffer for re-upload on next backend sync. Call after
   * mutating `buffer` contents to flush changes to the GPU.
   */
  public commit(): this {
    this._dirty = { full: true, x: 0, y: 0, width: this.width, height: this.height };
    this.setSize(this.width, this.height);
    // setSize is a no-op when dimensions don't change; force version bump for sync detection.
    (this as unknown as { _version: number })._version++;

    return this;
  }

  /**
   * Mark a sub-region of the buffer dirty for partial upload. More efficient
   * than {@link commit} for ring-buffer patterns where only one row or column
   * changes per frame. If a region was already pending, the union is uploaded.
   *
   * Coordinates are pixel-space with origin at the top-left. Bounds are clamped
   * to the texture dimensions; out-of-range rectangles throw.
   */
  public commitRect(x: number, y: number, width: number, height: number): this {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error(`DataTexture commitRect requires integer coordinates (got ${x}, ${y}, ${width}, ${height}).`);
    }
    if (width <= 0 || height <= 0) {
      throw new Error(`DataTexture commitRect requires positive width and height (got ${width}, ${height}).`);
    }
    if (x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      throw new Error(
        `DataTexture commitRect (${x}, ${y}, ${width}, ${height}) is out of bounds for ${this.width}x${this.height}.`,
      );
    }

    if (this._dirty === null) {
      this._dirty = { full: false, x, y, width, height };
    } else if (this._dirty.full) {
      // Already pending full upload — region is subsumed.
    } else {
      // Union with the existing pending region.
      const minX = Math.min(this._dirty.x, x);
      const minY = Math.min(this._dirty.y, y);
      const maxX = Math.max(this._dirty.x + this._dirty.width, x + width);
      const maxY = Math.max(this._dirty.y + this._dirty.height, y + height);

      this._dirty = { full: false, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    (this as unknown as { _version: number })._version++;

    return this;
  }

  /**
   * Internal: backend reads the pending dirty region and clears it. Returns
   * `null` when there is nothing pending. Backends call this once per sync
   * pass to plan their texSubImage2D / writeTexture operations.
   *
   * @internal
   */
  public _consumeDirtyRegion(): DataTextureDirtyRegion | null {
    const region = this._dirty;
    this._dirty = null;

    return region;
  }
}

function isFloatFormat(format: DataTextureFormat): boolean {
  return format === 'r32f' || format === 'rgba32f';
}
