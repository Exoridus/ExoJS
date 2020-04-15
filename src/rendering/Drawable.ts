import { SceneNode } from '../core/SceneNode';
import { Color } from '../core/Color';
import { BlendModes } from '../const/rendering';
import { View } from './View';
import { RenderManager } from './RenderManager';

export class Drawable extends SceneNode {

    private _visible = true;
    private _tint: Color = Color.White.clone();
    private _blendMode: BlendModes = BlendModes.NORMAL;

    get visible() {
        return this._visible;
    }

    set visible(visible) {
        this._visible = visible;
    }

    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this.setTint(tint);
    }

    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
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
        return view.getBounds().intersects(this.getBounds());
    }

    destroy() {
        super.destroy();

        this._tint.destroy();
    }
}
