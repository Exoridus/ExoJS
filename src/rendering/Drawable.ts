import { Color } from '@/core/Color';
import { BlendModes } from '@/rendering/types';

import type { RenderPlanBuilder } from './plan/RenderPlanBuilder';
import { RenderNode } from './RenderNode';

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
