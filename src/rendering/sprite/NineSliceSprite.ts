import type { ReadonlyRectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

import type { NineSliceInsets, NineSliceModes, NineSliceOptions, NineSliceQuad } from './nineSlice';
import { buildNineSliceQuads, equalInsets, equalModes, normalizeInsets, normalizeModes, validateBorder, validateSlices } from './nineSlice';

const validateSizeInput = (width: number, height: number): void => {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`NineSliceSprite: width and height must be finite numbers (got ${width}, ${height}).`);
  }
  if (width < 0) {
    throw new Error(`NineSliceSprite: width must be non-negative (got ${width}).`);
  }
  if (height < 0) {
    throw new Error(`NineSliceSprite: height must be non-negative (got ${height}).`);
  }
};

/**
 * A scalable nine-slice (9-patch) sprite.
 * Corners stay pixel-perfect; edges/center fill by stretch, repeat, or mirror-repeat.
 * @stable
 */
export class NineSliceSprite extends Drawable {
  private _region: TextureRegion;
  private _slices: Readonly<NineSliceInsets>;
  private _border: Readonly<NineSliceInsets>;
  private _width: number;
  private _height: number;
  private _modes: Readonly<NineSliceModes>;

  private _quads: NineSliceQuad[] = [];
  private _geometryDirty = true;
  /** Texture version the cached quads were built against; -1 before the first build. */
  private _builtTextureVersion = -1;

  public constructor(texture: Texture | TextureRegion, options: NineSliceOptions) {
    super();

    // Whole-texture region rather than an explicit full-size rectangle: a bare
    // texture may still be a loader handle reporting 0x0, which an explicit
    // rectangle cannot describe and would reject.
    this._region = texture instanceof TextureRegion ? texture : new TextureRegion(texture);

    const region = this._region;

    // Validate and own slices. A region over a texture that has not loaded yet
    // reports no dimensions, so the slices cannot be checked against it here -
    // the first geometry build that sees real dimensions does it instead.
    const rawSlices = normalizeInsets(options.slices);
    validateSlices(rawSlices, region.width, region.height);
    this._slices = rawSlices;

    // Validate and own border
    const rawBorder = options.border !== undefined ? normalizeInsets(options.border) : normalizeInsets(options.slices);
    validateBorder(rawBorder);
    this._border = rawBorder;

    // Validate and own size
    const width = options.width ?? region.width;
    const height = options.height ?? region.height;
    validateSizeInput(width, height);
    this._width = width;
    this._height = height;

    // Copy and freeze modes
    this._modes = normalizeModes(options.modes);
  }

  // -----------------------------------------------------------------------
  // Public read-only accessors (engine-owned, frozen)
  // -----------------------------------------------------------------------

  /** The TextureRegion this nine-slice samples from. */
  public get region(): TextureRegion {
    return this._region;
  }

  /** Convenience accessor: the texture underlying the region. */
  public get texture(): Texture {
    return this._region.texture;
  }

  /** The engine-owned, frozen source slice insets. */
  public get slices(): Readonly<NineSliceInsets> {
    return this._slices;
  }

  /** The engine-owned, frozen destination border insets. */
  public get border(): Readonly<NineSliceInsets> {
    return this._border;
  }

  /** The engine-owned, frozen edge/center fill modes. */
  public get modes(): Readonly<NineSliceModes> {
    return this._modes;
  }

  // -----------------------------------------------------------------------
  // Width / Height (with atomic validation)
  // -----------------------------------------------------------------------

  /** Destination width in local units. */
  public get width(): number {
    return this._width;
  }

  public set width(value: number) {
    this.setSize(value, this._height);
  }

  /** Destination height in local units. */
  public get height(): number {
    return this._height;
  }

  public set height(value: number) {
    this.setSize(this._width, value);
  }

  // -----------------------------------------------------------------------
  // Mutators
  // -----------------------------------------------------------------------

  /** Set destination size. Fails atomically - prior state is preserved on invalid input. */
  public setSize(width: number, height: number): this {
    validateSizeInput(width, height);

    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._geometryDirty = true;
      this.invalidateCache();
    }

    return this;
  }

  /** Update the SOURCE-space slice insets. Fails atomically. No-ops on equivalent values. */
  public setSlices(slices: number | Partial<NineSliceInsets>): this {
    const region = this._region;
    const normalized = normalizeInsets(slices);
    validateSlices(normalized, region.width, region.height);

    if (equalInsets(normalized, this._slices)) {
      return this;
    }

    this._slices = normalized;
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  /** Update the DESTINATION border sizes. Fails atomically. No-ops on equivalent values. */
  public setBorder(border: number | Partial<NineSliceInsets>): this {
    const normalized = normalizeInsets(border);
    validateBorder(normalized);

    if (equalInsets(normalized, this._border)) {
      return this;
    }

    this._border = normalized;
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  /** Update the edge/center fill modes. Input is copied, validated, and frozen. No-ops on equivalent values. */
  public setModes(modes: NineSliceModes): this {
    const normalized = normalizeModes(modes);

    if (equalModes(normalized, this._modes)) {
      return this;
    }

    this._modes = normalized;
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  // -----------------------------------------------------------------------
  // Bounds
  // -----------------------------------------------------------------------

  /**
   * Recomputed lazily on read from the current logical size, so it writes
   * `_localBounds` directly instead of going through `_setLocalBounds`: an
   * invalidating write inside a getter would re-dirty the node on every read.
   * The size setters own the invalidation for this node.
   */
  public override getLocalBounds(): ReadonlyRectangle {
    return this._localBounds.set(0, 0, this._width, this._height);
  }

  // -----------------------------------------------------------------------
  // Internal geometry (for renderers)
  // -----------------------------------------------------------------------

  /**
   * Lazily-built geometry quads. Each quad describes one rendered sub-region
   * in local space with its corresponding UV bounds.
   * @internal
   */
  public get quads(): readonly NineSliceQuad[] {
    // The texture's version moves whenever its size does, which is how a region
    // built over a still-loading handle announces that the geometry cached here
    // was computed against dimensions that no longer hold.
    if (this._geometryDirty || this._region.texture.version !== this._builtTextureVersion) {
      this._rebuildGeometry();
    }

    return this._quads;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _rebuildGeometry(): void {
    const region = this._region;

    // The construction-time check could not run against a texture that had not
    // loaded yet; this is the first point where the slices can be held against
    // real dimensions.
    validateSlices(this._slices, region.width, region.height);

    this._quads = buildNineSliceQuads(region, this._slices, this._border, this._width, this._height, this._modes);
    this._geometryDirty = false;
    this._builtTextureVersion = region.texture.version;
  }
}
