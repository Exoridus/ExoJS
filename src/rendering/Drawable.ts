import { Color } from '#core/Color';
import { drawableHasOwnMaterial, type MaterialKey, writeMaterialKeyInto } from '#rendering/plan/RenderCommand';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import type { RenderBackend } from '#rendering/RenderBackend';

import { isPixelSnapMode, PixelSnapMode } from './pixelSnap';
import { RenderNode } from './RenderNode';
import { BlendModes } from './types';

/**
 * Base class for every renderable scene object.
 *
 * Extends {@link RenderNode} with a per-object tint colour and blend mode.
 * Concrete drawable types (sprites, meshes, text, etc.) extend this class
 * and are paired with a matching {@link Renderer} via {@link RendererRegistry}.
 */
export class Drawable extends RenderNode {
  private _tint: Color = Color.white.clone();
  private _blendMode: BlendModes = BlendModes.Normal;
  private _pixelSnapMode: PixelSnapMode = PixelSnapMode.None;

  /**
   * Cached material key (Slice 2b). `null` until first computed or after
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
   * Resolve this drawable's {@link MaterialKey}, reusing a cached key when valid
   * (Slice 2b). The cache busts on any tint/blend/texture/material/shader/
   * pixel-snap mutation via {@link invalidateCache}, and on a backend switch.
   *
   * Drawables that own a {@link Material} are never cached — the material can
   * change its `pipelineKey`/`bindKey` internally without notifying the node —
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
  }
}
