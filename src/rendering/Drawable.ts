import { Color } from '#core/Color';
import { SceneNodeVectorChannel } from '#core/SceneNode';
import type { AbstractVector } from '#math/AbstractVector';
import { ObservableVector } from '#math/ObservableVector';
import { drawableHasOwnMaterial, type MaterialKey, writeMaterialKeyInto } from '#rendering/plan/RenderCommand';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import type { RenderBackend } from '#rendering/RenderBackend';

import { isPixelSnapMode, PixelSnapMode } from './pixelSnap';
import { RenderNode } from './RenderNode';
import { BlendModes } from './types';

/**
 * The anchor's channel as a plain number. `ObservableVector` hands the handler
 * a bare `number`, so widening once here keeps the comparison below between two
 * values of the same type instead of an enum against an untyped number.
 */
const anchorChannel: number = SceneNodeVectorChannel.Anchor;

/**
 * Base class for every renderable scene object.
 *
 * Extends {@link RenderNode} with a per-object tint colour, blend mode, and the
 * normalized `anchor` that derives {@link SceneNode.origin} from the object's
 * layout box. The anchor lives here rather than on {@link SceneNode} because it
 * needs a box to measure: a {@link Container} carries no geometry of its own,
 * so an anchor on one would silently resolve to `(0, 0)` forever.
 *
 * Concrete drawable types (sprites, meshes, text, etc.) extend this class
 * and are paired with a matching {@link Renderer} via {@link RendererRegistry}.
 */
export class Drawable extends RenderNode {
  /**
   * Write this drawable's canonical quad record - {@link SOURCE_QUAD_FLOATS}
   * floats at `offset` - and report whether it could.
   *
   * The default is a refusal: a drawable that does not describe itself as one
   * textured quad has no such record, and a persistent render source containing
   * one cannot be drawn from prepacked data. Overriding is what opts a drawable
   * into the persistent-indexed path, and the record must be COMPLETE - a source
   * that holds it never reads the drawable again while it stays usable.
   * @internal
   */
  public _packSourceQuad(_target: Float32Array, _offset: number): boolean {
    return false;
  }

  private _tint: Color = Color.white.clone();
  private _blendMode: BlendModes = BlendModes.Normal;
  private _pixelSnapMode: PixelSnapMode = PixelSnapMode.None;
  private _anchor = new ObservableVector(this, SceneNodeVectorChannel.Anchor, 0, 0);

  /**
   * Normalized anchor in 0..1 along each axis that derives `origin` from this
   * drawable's layout box. `(0, 0)` = top-left, `(0.5, 0.5)` = centre,
   * `(1, 1)` = bottom-right. Updates `origin` whenever the anchor or the
   * layout box changes.
   *
   * The mapping is a pure function of the anchor and the box size - the same
   * anchor value always yields the same origin, whatever it was set to before -
   * so `(0, 0)`, the default, always means `origin = (0, 0)`. Set `origin`
   * directly instead when the pivot is not a fraction of the box.
   */
  public get anchor(): ObservableVector {
    return this._anchor;
  }

  public set anchor(anchor: AbstractVector) {
    this._anchor.copy(anchor);
  }

  /**
   * Cached material key. `null` until first computed or after
   * {@link invalidateCache}. Bound to {@link _materialKeyBackend} so a backend
   * switch (multi-app / multi-backend) recomputes rather than returning stale
   * renderer ids. Drawables that carry their own {@link Material} bypass this
   * cache entirely (the material can mutate its keys without notifying us).
   */
  private _materialKey: MaterialKey | null = null;
  private _materialKeyBackend: RenderBackend | null = null;

  public get tint(): Color {
    return this._tint;
  }

  public set tint(tint: Color) {
    this.setTint(tint);
  }

  public get blendMode(): BlendModes {
    return this._blendMode;
  }

  public set blendMode(blendMode: BlendModes) {
    this.setBlendMode(blendMode);
  }

  /**
   * Render-only pixel-snapping policy for this drawable. Aligns the rendered
   * origin (`PixelSnapMode.Position`) or origin plus shared geometry boundaries
   * (`PixelSnapMode.Geometry`) to the active render target's device-pixel grid.
   * Purely visual: logical `x`/`y`, transforms, bounds, collision, tween and
   * physics state are never affected, and {@link getBounds}/{@link getGlobalTransform}
   * keep returning logical values.
   *
   * `PixelSnapMode.Geometry` is guaranteed only for axis-aligned transforms;
   * rotation or skew (on this node, an ancestor, or the view) downgrade it to
   * `PixelSnapMode.Position` for the affected frame, with no logical-state
   * change. Snapping targets device pixels (× view scale × pixel ratio), not
   * integer world units.
   *
   * Setting the current value is a no-op. Setting a value outside the
   * {@link PixelSnapMode} enum throws and leaves the prior mode unchanged.
   *
   * @default PixelSnapMode.None
   * @stable
   */
  public get pixelSnapMode(): PixelSnapMode {
    return this._pixelSnapMode;
  }

  public set pixelSnapMode(mode: PixelSnapMode) {
    if (mode === this._pixelSnapMode) {
      return;
    }

    if (!isPixelSnapMode(mode)) {
      throw new Error(`Drawable.pixelSnapMode must be a PixelSnapMode enum value (got ${String(mode)}).`);
    }

    this._pixelSnapMode = mode;
    this.invalidateCache();
  }

  /**
   * Set the tint colour by copying `color` into the internal {@link Color} instance.
   * Invalidates the render cache so the change is picked up on the next frame.
   */
  public setTint(color: Color): this {
    if (color) {
      this._tint.copy(color);
      this.invalidateCache();
    }

    return this;
  }

  /**
   * Change the blend mode. No-ops if the value is unchanged.
   * Invalidates the render cache when the blend mode actually changes.
   */
  public setBlendMode(blendMode: BlendModes): this {
    if (this._blendMode !== blendMode) {
      this._blendMode = blendMode;
      this.invalidateCache();
    }

    return this;
  }

  /** Set the normalized {@link anchor} and re-derive `origin` from it. */
  public setAnchor(x: number, y: number = x): this {
    this._anchor.set(x, y);

    return this;
  }

  /**
   * Routes the anchor channel to the origin re-derive and hands every other
   * channel back to {@link SceneNode._onObservableChange}. Overriding the one
   * shared handler is what keeps the reactive vectors closure-free: the anchor
   * carries a numeric channel like the rest instead of a bound callback.
   * @internal
   */
  public override _onObservableChange(channel: number): void {
    if (channel === anchorChannel) {
      this._updateOrigin();

      return;
    }

    super._onObservableChange(channel);
  }

  /**
   * Re-derive `origin` from the fractional anchor and the CURRENT layout box.
   * Uses local (untransformed) bounds on purpose: the transform multiplies the
   * origin by scale itself, so deriving from world bounds would double-apply
   * scale whenever the anchor is set after scaling. Subclasses whose layout box
   * changes after construction (e.g. a sprite switching to a texture sub-frame)
   * must call this to keep an anchored node anchored.
   *
   * The anchor measures against the drawable's declared LAYOUT BOX - its
   * extent, taken from its own local origin - and never against where its AABB
   * happens to start. Only the size term participates, so the mapping from
   * anchor to origin is a pure function of the anchor and the box size:
   * `anchor = (0, 0)` always means `origin = (0, 0)`, whatever the anchor was
   * set to before. Folding the bounds origin in would make it path-dependent
   * instead - a drawable whose rectangle starts off-origin would keep that
   * corner baked into its origin after returning to the default anchor.
   *
   * A drawable whose layout box is NOT its local bounds overrides this: text
   * measures against its typographic advance, an {@link AnimatedSprite} against
   * the untrimmed source frame rather than the per-frame trimmed rectangle.
   */
  protected _updateOrigin(): void {
    const { x, y } = this._anchor;
    const bounds = this.getLocalBounds();

    this.setOrigin(bounds.width * x, bounds.height * y);
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    builder.emitDraw(this);
  }

  /** @internal */
  public override _isDrawableForRenderPlan(): boolean {
    return true;
  }

  /** @internal */
  public override _renderPlanGetBlendMode(): BlendModes {
    return this._blendMode;
  }

  /**
   * Resolve this drawable's {@link MaterialKey}, reusing a cached key when valid.
   * The cache busts on any tint/blend/texture/material/shader/
   * pixel-snap mutation via {@link invalidateCache}, and on a backend switch.
   *
   * Drawables that own a {@link Material} are never cached - the material can
   * change its `pipelineKey`/`bindKey` internally without notifying the node -
   * so they recompute into the held key (still zero per-frame allocation).
   *
   * @internal
   */
  public _getOrComputeMaterialKey(backend: RenderBackend): MaterialKey {
    const cached = this._materialKey;

    if (cached !== null) {
      if (drawableHasOwnMaterial(this)) {
        // Own-material path: never trust the cache, but reuse the held object.
        return writeMaterialKeyInto(cached, this, backend);
      }

      if (this._materialKeyBackend === backend) {
        return cached;
      }

      // Backend switched: recompute into the held key, rebind to the backend.
      this._materialKeyBackend = backend;

      return writeMaterialKeyInto(cached, this, backend);
    }

    const key = writeMaterialKeyInto(
      {
        rendererId: 0,
        blendMode: this._blendMode,
        textureId: -1,
        shaderId: -1,
        pipelineKey: 0,
        bindKey: 0,
        ownMaterial: false,
      },
      this,
      backend,
    );

    this._materialKey = key;
    this._materialKeyBackend = backend;

    return key;
  }

  public override invalidateCache(): this {
    super.invalidateCache();
    // Bust the cached material key; next emitDraw recomputes it. The held object
    // is kept and rewritten in place on the next miss (no re-allocation).
    this._materialKeyBackend = null;

    return this;
  }

  public override destroy(): void {
    super.destroy();

    this._tint.destroy();
    this._anchor.destroy();
  }
}
