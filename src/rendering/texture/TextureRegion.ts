import type { Texture } from './Texture';

/**
 * Per-edge extrusion/padding metadata for a {@link TextureRegion}.
 *
 * Describes the number of duplicated/extruded source texels available outside
 * each logical edge so that linear filtering can sample safely without
 * bleeding from neighbouring atlas regions.
 * @stable
 */
export interface TextureRegionInsets {
  /** Extrusion texels on the left edge (outside `x`). */
  readonly left: number;
  /** Extrusion texels on the top edge (outside `y`). */
  readonly top: number;
  /** Extrusion texels on the right edge (outside `x + width`). */
  readonly right: number;
  /** Extrusion texels on the bottom edge (outside `y + height`). */
  readonly bottom: number;
}

/**
 * Options passed to the {@link TextureRegion} constructor.
 * @stable
 */
export interface TextureRegionOptions {
  /** Left pixel coordinate of the region within the texture. */
  readonly x: number;
  /** Top pixel coordinate of the region within the texture. */
  readonly y: number;
  /** Width of the region in texture pixels. */
  readonly width: number;
  /** Height of the region in texture pixels. */
  readonly height: number;

  /**
   * Number of duplicated/extruded source texels available outside each
   * logical edge for safe linear filtering.
   *
   * A uniform `number` sets all four sides equally. Provide a
   * {@link TextureRegionInsets} for per-side control.
   *
   * Defaults to `{ left: 0, top: 0, right: 0, bottom: 0 }`.
   */
  readonly extrusion?: number | TextureRegionInsets;
}

function isFinite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeExtrusion(extrusion: number | TextureRegionInsets | undefined): TextureRegionInsets {
  if (extrusion === undefined) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  if (typeof extrusion === 'number') {
    return { left: extrusion, top: extrusion, right: extrusion, bottom: extrusion };
  }

  return extrusion;
}

function validateExtrusion(extrusion: TextureRegionInsets, x: number, y: number, width: number, height: number, textureWidth: number, textureHeight: number): void {
  const { left, top, right, bottom } = extrusion;

  if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) {
    throw new Error(`TextureRegion extrusion values must be finite numbers (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }

  if (left < 0 || top < 0 || right < 0 || bottom < 0) {
    throw new Error(`TextureRegion extrusion values must be non-negative (got left=${left}, top=${top}, right=${right}, bottom=${bottom}).`);
  }

  if (left > x || top > y || right > textureWidth - (x + width) || bottom > textureHeight - (y + height)) {
    throw new Error(
      `TextureRegion extrusion exceeds available source texture bounds: left=${left} (>${x}), top=${top} (>${y}), ` +
      `right=${right} (>${textureWidth - (x + width)}), bottom=${bottom} (>${textureHeight - (y + height)}).`
    );
  }
}

function validateOptions(options: TextureRegionOptions, textureWidth: number, textureHeight: number): void {
  const { x, y, width, height } = options;

  if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) {
    throw new Error(`TextureRegion coordinates and dimensions must be finite numbers (got x=${x}, y=${y}, width=${width}, height=${height}).`);
  }

  if (width <= 0 || height <= 0) {
    throw new Error(`TextureRegion dimensions must be positive (got width=${width}, height=${height}).`);
  }

  if (textureWidth <= 0 || textureHeight <= 0) {
    throw new Error(`Texture must have positive dimensions (got ${textureWidth}x${textureHeight}).`);
  }

  if (x < 0 || y < 0) {
    throw new Error(`TextureRegion origin must be non-negative (got x=${x}, y=${y}).`);
  }

  if (x >= textureWidth || y >= textureHeight) {
    throw new Error(`TextureRegion origin (${x}, ${y}) is outside texture bounds (${textureWidth}x${textureHeight}).`);
  }

  if (x + width > textureWidth) {
    throw new Error(
      `TextureRegion right edge (${x + width}) exceeds texture width (${textureWidth}).`
    );
  }

  if (y + height > textureHeight) {
    throw new Error(
      `TextureRegion bottom edge (${y + height}) exceeds texture height (${textureHeight}).`
    );
  }
}

/**
 * An immutable descriptor for a rectangular sub-region of a {@link Texture}.
 *
 * Stores the pixel-space source rectangle, pre-computed normalised UV bounds,
 * and optional extrusion/padding metadata for atlas-safe linear filtering.
 * Constructed once and reused across sprites, tile-sets, atlas lookups, and
 * the scalable-sprite repeat planners.
 *
 * Texture dimensions **must** be known at construction time; a texture with
 * zero dimensions will cause the constructor to throw.
 *
 * @example
 * ```ts
 * const region = new TextureRegion(texture, {
 *   x: 32,  y: 16,
 *   width: 64, height: 32,
 * });
 * ```
 * @stable
 */
export class TextureRegion {
  /** The underlying {@link Texture} this region belongs to. */
  public readonly texture: Texture;

  /** Left edge of the region in texture pixels. */
  public readonly x: number;
  /** Top edge of the region in texture pixels. */
  public readonly y: number;
  /** Width of the region in texture pixels. */
  public readonly width: number;
  /** Height of the region in texture pixels. */
  public readonly height: number;

  /** Normalised left texture coordinate (U-min). */
  public readonly u0: number;
  /** Normalised top texture coordinate (V-min). */
  public readonly v0: number;
  /** Normalised right texture coordinate (U-max). */
  public readonly u1: number;
  /** Normalised bottom texture coordinate (V-max). */
  public readonly v1: number;

  /** Per-edge extrusion/padding metadata (immutable). */
  public readonly extrusion: TextureRegionInsets;

  /**
   * Create a new immutable region.
   *
   * @throws When coordinates or dimensions are non-finite, zero, negative, or
   *         extend beyond the texture bounds, or when extrusion values are
   *         invalid.
   */
  public constructor(texture: Texture, options: TextureRegionOptions) {
    if (!texture) {
      throw new Error('TextureRegion requires a non-null Texture.');
    }

    const textureWidth = texture.width;
    const textureHeight = texture.height;

    validateOptions(options, textureWidth, textureHeight);

    const extrusion = normalizeExtrusion(options.extrusion);

    validateExtrusion(extrusion, options.x, options.y, options.width, options.height, textureWidth, textureHeight);

    this.texture = texture;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;

    this.u0 = options.x / textureWidth;
    this.v0 = options.y / textureHeight;
    this.u1 = (options.x + options.width) / textureWidth;
    this.v1 = (options.y + options.height) / textureHeight;

    this.extrusion = extrusion;
  }
}
