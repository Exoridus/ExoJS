import { SceneNode } from 'core/SceneNode';
import { Color } from 'core/Color';
import { BlendModes } from 'types/rendering';
import type { View } from './View';
import type { RenderManager } from './RenderManager';

export class Drawable extends SceneNode {

    private _visible = true;
    private _tint: Color = Color.white.clone();
    private _blendMode: BlendModes = BlendModes.normal;

    public get visible(): boolean {
        return this._visible;
    }

    public set visible(visible: boolean) {
        this._visible = visible;
    }

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
        this._tint.copy(color);

        return this;
    }

    public setBlendMode(blendMode: BlendModes): this {
        this._blendMode = blendMode;

        return this;
    }

    public render(renderManager: RenderManager): this {
        throw new Error('Method not implemented!');
    }

    public inView(view: View): boolean {
        return view.getBounds().intersectsWith(this.getBounds());
    }

    public destroy(): void {
        super.destroy();

        this._tint.destroy();
    }
}
