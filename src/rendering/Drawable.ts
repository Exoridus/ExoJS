import { SceneNode } from 'core/SceneNode';
import { Color } from 'core/Color';
import { BlendModes } from 'types/rendering';
import type { SceneRenderRuntime } from './SceneRenderRuntime';

export class Drawable extends SceneNode {

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
        }

        return this;
    }

    public setBlendMode(blendMode: BlendModes): this {
        this._blendMode = blendMode;

        return this;
    }

    public override render(renderManager: SceneRenderRuntime): this {
        if (this.visible && this.inView(renderManager.view)) {
            renderManager.draw(this);
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this._tint.destroy();
    }
}
