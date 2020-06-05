import { SceneNode } from 'core/SceneNode';
import { Color } from 'core/Color';
import { BlendModes } from 'types/rendering';
import type { View } from './View';
import type { RenderManager } from './RenderManager';

export class Drawable extends SceneNode {

    private _visible = true;
    private _tint: Color = Color.White.clone();
    private _blendMode: BlendModes = BlendModes.NORMAL;

    get visible(): boolean {
        return this._visible;
    }

    set visible(visible: boolean) {
        this._visible = visible;
    }

    get tint(): Color {
        return this._tint;
    }

    set tint(tint: Color) {
        this.setTint(tint);
    }

    get blendMode(): BlendModes {
        return this._blendMode;
    }

    set blendMode(blendMode: BlendModes) {
        this.setBlendMode(blendMode);
    }

    setTint(color: Color): this {
        this._tint.copy(color);

        return this;
    }

    setBlendMode(blendMode: BlendModes): this {
        this._blendMode = blendMode;

        return this;
    }

    render(renderManager: RenderManager): this {
        throw new Error('Method not implemented!');
    }

    inView(view: View): boolean {
        return view.getBounds().intersectsWith(this.getBounds());
    }

    destroy(): void {
        super.destroy();

        this._tint.destroy();
    }
}
