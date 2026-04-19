import { Color } from '@/core/Color';
import { BlendModes } from '@/rendering/types';
import type { SceneRenderRuntime } from './SceneRenderRuntime';
import { RenderNode } from './RenderNode';

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

    public setTint(color: Color): this {
        if (color) {
            this._tint.copy(color);
            this.invalidateCache();
        }

        return this;
    }

    public setBlendMode(blendMode: BlendModes): this {
        if (this._blendMode !== blendMode) {
            this._blendMode = blendMode;
            this.invalidateCache();
        }

        return this;
    }

    public override render(renderManager: SceneRenderRuntime): this {
        if (!this.visible) {
            return this;
        }

        if (!this.inView(renderManager.view)) {
            renderManager.stats.culledNodes++;

            return this;
        }

        this.renderVisualContent(renderManager, () => {
            renderManager.draw(this);
        }, this._blendMode);

        return this;
    }

    public override destroy(): void {
        super.destroy();

        this._tint.destroy();
    }
}
