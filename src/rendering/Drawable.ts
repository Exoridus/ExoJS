import { Color } from '#core/Color';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';

import { isPixelSnapMode, type PixelSnapMode } from './pixelSnap';
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
  private _pixelSnapMode: PixelSnapMode = 'none';

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
   * origin (`'position'`) or origin plus shared geometry boundaries
   * (`'geometry'`) to the active render target's device-pixel grid. Purely
   * visual: logical `x`/`y`, transforms, bounds, collision, tween and physics
   * state are never affected, and {@link getBounds}/{@link getGlobalTransform}
   * keep returning logical values.
   *
   * `'geometry'` is guaranteed only for axis-aligned transforms; rotation or
   * skew (on this node, an ancestor, or the view) downgrade it to `'position'`
   * for the affected frame, with no logical-state change. Snapping targets
   * device pixels (× view scale × pixel ratio), not integer world units.
   *
   * Setting the current value is a no-op. Setting a value outside the
   * {@link PixelSnapMode} union throws and leaves the prior mode unchanged.
   *
   * @default 'none'
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
      throw new Error(`Drawable.pixelSnapMode must be 'none', 'position', or 'geometry' (got ${String(mode)}).`);
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

  public override destroy(): void {
    super.destroy();

    this._tint.destroy();
  }
}
