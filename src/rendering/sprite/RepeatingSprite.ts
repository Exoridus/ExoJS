import { logger } from '#core/logging';
import type { Rectangle } from '#math/Rectangle';
import { Drawable } from '#rendering/Drawable';
import { buildPixelSnapContext, type RenderQuad, snapBoundsInto, snapQuadsInto } from '#rendering/pixelSnap';
import type { RepeatFit, RepeatMode } from '#rendering/texture/repeat';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import type { View } from '#rendering/View';

import type { RepeatingSpriteOptions, RepeatingSpriteQuad } from './repeatingSpritePlan';
import { buildRepeatingSpriteQuads, validateFit, validateMode, validateOffset, validateSizeInput } from './repeatingSpritePlan';

/**
 * A sprite that fills its destination by repeating, mirroring, or stretching
 * a source texture or atlas region.
 *
 * Supports independent per-axis modes (`modeX`, `modeY`) and fit strategies
 * (`fitX`, `fitY`).
 *
 * ## Internal rendering strategy (selected automatically)
 *
 * | Source type       | Internal path                                         |
 * |-------------------|-------------------------------------------------------|
 * | Bare `Texture`    | **Shader path** — one quad, GPU sampler repeat wrap.  |
 * | `TextureRegion`   | **Geometry path** — Cartesian-product quads, clamped. |
 *
 * The public class identity and API do not change based on which path the
 * renderer uses.
 *
 * @stable
 */
export class RepeatingSprite extends Drawable {
  private readonly _source: Texture | TextureRegion;
  private readonly _region: TextureRegion;
  private _width: number;
  private _height: number;
  private _modeX: RepeatMode;
  private _modeY: RepeatMode;
  private _fitX: RepeatFit;
  private _fitY: RepeatFit;
  private _offsetX: number;
  private _offsetY: number;

  private _quads: RepeatingSpriteQuad[] = [];
  private _geometryDirty = true;
  private readonly _renderQuads: RenderQuad[] = [];

  public constructor(source: Texture | TextureRegion, options?: RepeatingSpriteOptions) {
    super();

    this._source = source;
    this._region = source instanceof TextureRegion ? source : new TextureRegion(source, { x: 0, y: 0, width: source.width, height: source.height });

    const region = this._region;
    const opts = options ?? {};

    const modeX = opts.modeX ?? 'repeat';
    const modeY = opts.modeY ?? 'repeat';
    validateMode(modeX, 'modeX');
    validateMode(modeY, 'modeY');
    this._modeX = modeX;
    this._modeY = modeY;

    const fitX = opts.fitX ?? 'round';
    const fitY = opts.fitY ?? 'round';
    validateFit(fitX, 'fitX');
    validateFit(fitY, 'fitY');
    this._fitX = fitX;
    this._fitY = fitY;

    const offsetX = opts.offsetX ?? 0;
    const offsetY = opts.offsetY ?? 0;
    validateOffset(offsetX, 'offsetX');
    validateOffset(offsetY, 'offsetY');
    this._offsetX = offsetX;
    this._offsetY = offsetY;

    const width = opts.width ?? region.width;
    const height = opts.height ?? region.height;
    validateSizeInput(width, height);
    this._width = width;
    this._height = height;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** The original source passed to the constructor. */
  public get source(): Texture | TextureRegion {
    return this._source;
  }

  /** TextureRegion wrapping the source (bare Texture sources auto-wrapped). */
  public get region(): TextureRegion {
    return this._region;
  }

  /** Convenience accessor: the underlying Texture. */
  public get texture(): Texture {
    return this._region.texture;
  }

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

  /** Horizontal repeat mode. */
  public get modeX(): RepeatMode {
    return this._modeX;
  }

  public set modeX(value: RepeatMode) {
    validateMode(value, 'modeX');
    if (this._modeX !== value) {
      this._modeX = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /** Vertical repeat mode. */
  public get modeY(): RepeatMode {
    return this._modeY;
  }

  public set modeY(value: RepeatMode) {
    validateMode(value, 'modeY');
    if (this._modeY !== value) {
      this._modeY = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /** Horizontal fit mode (how partial repeats are resolved). */
  public get fitX(): RepeatFit {
    return this._fitX;
  }

  public set fitX(value: RepeatFit) {
    validateFit(value, 'fitX');
    if (this._fitX !== value) {
      this._fitX = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /** Vertical fit mode (how partial repeats are resolved). */
  public get fitY(): RepeatFit {
    return this._fitY;
  }

  public set fitY(value: RepeatFit) {
    validateFit(value, 'fitY');
    if (this._fitY !== value) {
      this._fitY = value;
      this._geometryDirty = true;
      this.invalidateCache();
    }
  }

  /**
   * Horizontal scroll offset in source-pixel units.
   *
   * On the shader path (bare `Texture` source), changing the offset does
   * **not** trigger a geometry rebuild — the value is forwarded as
   * per-instance data at render time.  On the geometry path
   * (`TextureRegion` source), offset changes mark quads dirty.
   */
  public get offsetX(): number {
    return this._offsetX;
  }

  public set offsetX(value: number) {
    this.setOffset(value, this._offsetY);
  }

  /** Vertical scroll offset in source-pixel units.  See {@link offsetX}. */
  public get offsetY(): number {
    return this._offsetY;
  }

  public set offsetY(value: number) {
    this.setOffset(this._offsetX, value);
  }

  // -----------------------------------------------------------------------
  // Fluent mutators
  // -----------------------------------------------------------------------

  /** Set destination size atomically. Preserves prior state on invalid input. */
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

  /**
   * Set scroll offset atomically in source-pixel units.
   * On the shader path this does not rebuild geometry.
   * On the geometry path this marks geometry dirty.
   */
  public setOffset(offsetX: number, offsetY: number): this {
    validateOffset(offsetX, 'offsetX');
    validateOffset(offsetY, 'offsetY');

    if (this._offsetX !== offsetX || this._offsetY !== offsetY) {
      this._offsetX = offsetX;
      this._offsetY = offsetY;

      if (this.resolvedStrategy === 'geometry') {
        this._geometryDirty = true;
      }

      this.invalidateCache();
    }

    return this;
  }

  // -----------------------------------------------------------------------
  // Bounds
  // -----------------------------------------------------------------------

  public override getLocalBounds(): Rectangle {
    const bounds = super.getLocalBounds();
    bounds.set(0, 0, this._width, this._height);
    return bounds;
  }

  // -----------------------------------------------------------------------
  // Internal renderer interface
  // -----------------------------------------------------------------------

  /**
   * Rendering strategy determined by the source type:
   * - `'shader'` — bare `Texture`; renderer uses GPU sampler wrap.
   * - `'geometry'` — `TextureRegion`; renderer builds repeat quads.
   * @internal
   */
  public get resolvedStrategy(): 'shader' | 'geometry' {
    return this._source instanceof TextureRegion ? 'geometry' : 'shader';
  }

  /**
   * Lazily-built geometry quads for the geometry path.
   * Returns an empty array on the shader path.
   * @internal
   */
  public get quads(): readonly RepeatingSpriteQuad[] {
    if (this.resolvedStrategy === 'geometry' && this._geometryDirty) {
      this._rebuildGeometry();
    }
    return this._quads;
  }

  /**
   * Render-time quads for the **geometry strategy**, device-pixel-snapped in
   * `'geometry'` pixel-snap mode (axis-aligned only). Like NineSlice, every
   * shared repeat-segment boundary is snapped once by {@link snapQuadsInto}, so
   * adjacent segments stay gap-free; the content cache ({@link quads}) is never
   * rebuilt by snapping. Returns the unsnapped quads otherwise.
   * @internal
   */
  public getRenderQuads(view: View, targetPxWidth: number, targetPxHeight: number): readonly RepeatingSpriteQuad[] {
    const base = this.quads;

    if (this.pixelSnapMode !== 'geometry' || base.length === 0) {
      return base;
    }

    // World transform (composed through any RetainedContainer boundary) so the
    // device scale / axis-alignment reflect the group the GPU applies as u_group.
    const ctx = buildPixelSnapContext(this.getWorldTransform(), view, targetPxWidth, targetPxHeight);

    if (!ctx.axisAligned) {
      logger.warn('pixelSnapMode "geometry" downgraded to "position" for a rotated/skewed transform; rendered geometry is not boundary-snapped this frame.', {
        source: 'RepeatingSprite',
        once: 'pixel-snap:geometry-downgrade',
      });

      return base;
    }

    return snapQuadsInto(base, ctx, this._renderQuads);
  }

  /**
   * Render-time destination bounds for the **shader strategy**, written into
   * `out`. In `'geometry'` pixel-snap mode (axis-aligned only) the destination
   * quad edges are snapped to the device grid; repetition stays shader-based, so
   * only the outer rectangle moves. Returns the logical local bounds otherwise.
   * @internal
   */
  public getRenderBounds(view: View, targetPxWidth: number, targetPxHeight: number, out: Rectangle): Rectangle {
    const base = this.getLocalBounds();

    if (this.pixelSnapMode !== 'geometry') {
      return base;
    }

    // World transform (composed through any RetainedContainer boundary) so the
    // device scale / axis-alignment reflect the group the GPU applies as u_group.
    const ctx = buildPixelSnapContext(this.getWorldTransform(), view, targetPxWidth, targetPxHeight);

    if (!ctx.axisAligned) {
      logger.warn('pixelSnapMode "geometry" downgraded to "position" for a rotated/skewed transform; rendered geometry is not boundary-snapped this frame.', {
        source: 'RepeatingSprite',
        once: 'pixel-snap:geometry-downgrade',
      });

      return base;
    }

    return snapBoundsInto(base, ctx, out);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _rebuildGeometry(): void {
    this._quads = buildRepeatingSpriteQuads(
      this._region,
      this._width,
      this._height,
      this._modeX,
      this._modeY,
      this._fitX,
      this._fitY,
      this._offsetX,
      this._offsetY,
    );
    this._geometryDirty = false;
  }
}
