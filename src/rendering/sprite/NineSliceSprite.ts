import { Drawable } from '#rendering/Drawable';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

import type { NineSliceInsets, NineSliceModes, NineSliceOptions, NineSliceQuad } from './nineSlice';
import { buildNineSliceQuads, normalizeInsets } from './nineSlice';

/**
 * A scalable nine-slice (9-patch) sprite.
 * Corners stay pixel-perfect; edges/center fill by stretch, repeat, or mirror-repeat.
 * @stable
 */
export class NineSliceSprite extends Drawable {
  private _region: TextureRegion;
  private _slices: NineSliceInsets;
  private _border: NineSliceInsets;
  private _width: number;
  private _height: number;
  private _modes: NineSliceModes | undefined;
  private _bleed: number;

  private _quads: NineSliceQuad[] = [];
  private _geometryDirty = true;

  public constructor(texture: Texture | TextureRegion, options: NineSliceOptions) {
    super();

    this._region = texture instanceof TextureRegion
      ? texture
      : new TextureRegion(texture, {
          x: 0,
          y: 0,
          width: texture.width,
          height: texture.height,
        });

    const region = this._region;

    const rawSlices = normalizeInsets(options.slices);

    if (!Number.isFinite(rawSlices.left) || !Number.isFinite(rawSlices.top) ||
        !Number.isFinite(rawSlices.right) || !Number.isFinite(rawSlices.bottom)) {
      throw new Error('NineSliceSprite: slices must be finite numbers.');
    }

    if (rawSlices.left < 0 || rawSlices.top < 0 || rawSlices.right < 0 || rawSlices.bottom < 0) {
      throw new Error('NineSliceSprite: slice values must be non-negative.');
    }

    if (rawSlices.left + rawSlices.right > region.width) {
      throw new Error(`NineSliceSprite: slices.left (${rawSlices.left}) + slices.right (${rawSlices.right}) exceeds region width (${region.width}).`);
    }

    if (rawSlices.top + rawSlices.bottom > region.height) {
      throw new Error(`NineSliceSprite: slices.top (${rawSlices.top}) + slices.bottom (${rawSlices.bottom}) exceeds region height (${region.height}).`);
    }

    this._slices = rawSlices;

    this._border = options.border !== undefined
      ? normalizeInsets(options.border)
      : { ...rawSlices };

    this._width = options.width ?? region.width;
    this._height = options.height ?? region.height;
    this._modes = options.modes;
    this._bleed = options.bleed ?? 0.5;
  }

  /** The TextureRegion this nine-slice samples from. */
  public get region(): TextureRegion {
    return this._region;
  }

  /** Convenience accessor: the texture underlying the region. */
  public get texture(): Texture {
    return this._region.texture;
  }

  /** Destination width in local units. */
  public get width(): number {
    return this._width;
  }

  public set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /** Destination height in local units. */
  public get height(): number {
    return this._height;
  }

  public set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /** Set destination size. */
  public setSize(width: number, height: number): this {
    if (this._width !== width || this._height !== height) {
      this._width = width;
      this._height = height;
      this._geometryDirty = true;
      this.invalidateCache();
    }

    return this;
  }

  /** Update the SOURCE-space slice insets. */
  public setSlices(slices: number | Partial<NineSliceInsets>): this {
    this._slices = normalizeInsets(slices);
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  /** Update the DESTINATION border sizes. */
  public setBorder(border: number | Partial<NineSliceInsets>): this {
    this._border = normalizeInsets(border);
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  /** Update the edge/center fill modes. */
  public setModes(modes: NineSliceModes): this {
    this._modes = modes;
    this._geometryDirty = true;
    this.invalidateCache();
    return this;
  }

  /**
   * Lazily-built geometry quads. Each quad describes one rendered sub-region
   * in local space with its corresponding UV bounds.
   * @internal
   */
  public get quads(): readonly NineSliceQuad[] {
    if (this._geometryDirty) {
      this._rebuildGeometry();
    }

    return this._quads;
  }

  private _rebuildGeometry(): void {
    this._quads = buildNineSliceQuads(
      this._region,
      this._slices,
      this._border,
      this._width,
      this._height,
      this._modes,
      this._bleed,
    );
    this._geometryDirty = false;
  }
}
