import { Color } from '@/core/Color';
import { BlendModes } from '@/rendering/types';
import type { RenderBackend } from './RenderBackend';
import { RenderNode } from './RenderNode';

/**
 * Base class for every renderable scene object.
 *
 * Extends {@link RenderNode} with a per-object tint colour and blend mode,
 * and implements the default view-frustum culling logic in {@link render}.
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

    /**
     * Submit this drawable for rendering.
     * Skips invisible nodes and increments the cull counter for nodes that fall
     * outside the current view. Visible, in-view nodes are drawn via the backend
     * using the current blend mode.
     */
    public override render(backend: RenderBackend): this {
        if (!this.visible) {
            return this;
        }

        if (!this.inView(backend.view)) {
            backend.stats.culledNodes++;

            return this;
        }

        this.renderVisualContent(backend, () => {
            backend.draw(this);
        }, this._blendMode);

        return this;
    }

    public override destroy(): void {
        super.destroy();

        this._tint.destroy();
    }
}
