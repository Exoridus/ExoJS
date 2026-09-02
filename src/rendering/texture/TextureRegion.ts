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

const isFinite = (value: number): boolean => typeof value === 'number' && Number.isFinite(value);

const normalizeExtrusion = (extrusion: number | TextureRegionInsets | undefined): Readonly<TextureRegionInsets> => {
  if (extrusion === undefined) {
    return Object.freeze({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
  }

  if (typeof extrusion === 'number') {
    return Object.freeze({
      left: extrusion,
      top: extrusion,
      right: extrusion,
      bottom: extrusion,
    });
  }

  // Copy caller-owned values into an engine-owned frozen object so that
  // external mutation of the original never affects the region.
  return Object.freeze({
    left: extrusion.left,
    top: extrusion.top,
    right: extrusion.right,
    bottom: extrusion.bottom,
  });
};

const validateExtrusion = (
  extrusion: TextureRegionInsets,
  x: number,
  y: number,
  width: number,
  height: number,
  textureWidth: number,
  textureHeight: number,
): void => {
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
        `right=${right} (>${textureWidth - (x + width)}), bottom=${bottom} (>${textureHeight - (y + height)}).`,
    );
  }
};

const validateOptions = (options: TextureRegionOptions, textureWidth: number, textureHeight: number): void => {
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
    throw new Error(`TextureRegion right edge (${x + width}) exceeds texture width (${textureWidth}).`);
  }

  if (y + height > textureHeight) {
    throw new Error(`TextureRegion bottom edge (${y + height}) exceeds texture height (${textureHeight}).`);
  }
};

/**
 * An immutable descriptor for a rectangular sub-region of a {@link Texture}.
 *
 * Stores the pixel-space source rectangle, pre-computed normalised UV bounds,
 * and optional extrusion/padding metadata for atlas-safe linear filtering.
 * Constructed once and reused across sprites, tile-sets, atlas lookups, and
 * the scalable-sprite repeat planners.
 *
 * Extrusion metadata is copied and frozen during construction - the caller
 * retains no mutable reference to the stored object. The underlying
 * {@link Texture} reference is stable, but the Texture's own lifecycle and
 * sampler state remain owned by {@link Texture}.
 *
 * **Sub-regions** name an explicit rectangle. Their descriptor is fixed at
 * construction and validated against the texture, which must therefore already
 * know its dimensions - a still-loading texture makes the rectangle
 * unverifiable, so the constructor throws.
 *
 * **Whole-texture regions** omit the rectangle and cover the entire texture.
 * They derive their geometry from the texture instead of capturing it, so one
 * built from a loader handle that has not resolved yet reports zero dimensions
 * for the moment and the real ones as soon as the payload lands. Nothing has to
 * be rebuilt or invalidated for the region itself to become correct; consumers
 * that cache geometry off it watch {@link Texture.version}.
 *
 * @example
 * ```ts
 * // Sub-region: an explicit rectangle inside an atlas.
 * const region = new TextureRegion(texture, {
 *   x: 32,  y: 16,
 *   width: 64, height: 32,
 * });
 *
 * // Whole texture, safe to build from a handle that is still loading.
 * const full = new TextureRegion(loader.get('background.png'));
 * ```
 * @stable
 */
export class TextureRegion {
  /** The underlying {@link Texture} this region belongs to. */
  public readonly texture: Texture;

  /** Per-edge extrusion/padding metadata (engine-owned, frozen). */
  public readonly extrusion: Readonly<TextureRegionInsets>;

  /**
   * Whether this region covers the whole texture, in which case its geometry is
   * read from the texture on access rather than captured at construction.
   */
  private readonly _wholeTexture: boolean;

  private readonly _x: number;
  private readonly _y: number;
  private readonly _width: number;
  private readonly _height: number;
  private readonly _u0: number;
  private readonly _v0: number;
  private readonly _u1: number;
  private readonly _v1: number;

  /**
   * With `options`, a sub-region over that rectangle: validated against the
   * texture, which must already know its dimensions.
   *
   * Without, a region covering the whole texture: valid for a texture that has
   * not loaded yet, whose dimensions it then follows.
   *
   * @throws When the texture is null, when an explicit rectangle is non-finite,
   *         zero, negative, or reaches outside the texture, or when extrusion
   *         values are invalid.
   */
  public constructor(texture: Texture, options?: TextureRegionOptions) {
    if (!texture) {
      throw new Error('TextureRegion requires a non-null Texture.');
    }

    this.texture = texture;
    this._wholeTexture = options === undefined;

    if (options === undefined) {
      // Derived on access, so the geometry is whatever the texture currently
      // reports - including nothing, while a deferred handle is still loading.
      this._x = 0;
      this._y = 0;
      this._width = 0;
      this._height = 0;
      this._u0 = 0;
      this._v0 = 0;
      this._u1 = 1;
      this._v1 = 1;
      this.extrusion = normalizeExtrusion(undefined);

      if (__DEV__) {
        Object.freeze(this);
      }

      return;
    }

    const textureWidth = texture.width;
    const textureHeight = texture.height;

    validateOptions(options, textureWidth, textureHeight);

    const extrusion = normalizeExtrusion(options.extrusion);

    validateExtrusion(extrusion, options.x, options.y, options.width, options.height, textureWidth, textureHeight);

    this._x = options.x;
    this._y = options.y;
    this._width = options.width;
    this._height = options.height;

    this._u0 = options.x / textureWidth;
    this._v0 = options.y / textureHeight;
    this._u1 = (options.x + options.width) / textureWidth;
    this._v1 = (options.y + options.height) / textureHeight;

    this.extrusion = extrusion;

    if (__DEV__) {
      Object.freeze(this);
    }
  }

  /** Left edge of the region in texture pixels. */
  public get x(): number {
    return this._x;
  }

  /** Top edge of the region in texture pixels. */
  public get y(): number {
    return this._y;
  }

  /** Width of the region in texture pixels. */
  public get width(): number {
    return this._wholeTexture ? this.texture.width : this._width;
  }

  /** Height of the region in texture pixels. */
  public get height(): number {
    return this._wholeTexture ? this.texture.height : this._height;
  }

  /** Normalised left texture coordinate (U-min). */
  public get u0(): number {
    return this._u0;
  }

  /** Normalised top texture coordinate (V-min). */
  public get v0(): number {
    return this._v0;
  }

  /** Normalised right texture coordinate (U-max). */
  public get u1(): number {
    return this._u1;
  }

  /** Normalised bottom texture coordinate (V-max). */
  public get v1(): number {
    return this._v1;
  }
}
