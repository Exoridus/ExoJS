import type { Color } from '@/core/Color';
import type { RenderBackendType } from './RenderBackendType';
import type { RenderTarget } from './RenderTarget';
import type { View } from './View';
import type { Drawable } from './Drawable';
import type { RenderPass } from './RenderPass';
import type { Rectangle } from '@/math/Rectangle';
import type { Texture } from './texture/Texture';
import type { RenderTexture } from './texture/RenderTexture';
import type { RenderStats } from './RenderStats';
import type { BlendModes } from './types';

export interface RenderBackend {
    readonly backendType: RenderBackendType;
    readonly view: View;
    readonly renderTarget: RenderTarget;
    readonly stats: RenderStats;

    initialize(): Promise<this>;
    resetStats(): this;
    clear(color?: Color): this;
    resize(width: number, height: number): this;
    setView(view: View | null): this;
    setRenderTarget(target: RenderTarget | null): this;

    /**
     * Push an axis-aligned scissor rectangle. Used internally by the
     * `Rectangle` mask path on `RenderNode.mask`. Nested scissors
     * intersect with the previous scissor on the stack.
     */
    pushScissorRect(bounds: Rectangle): this;

    /**
     * Pop the most recently pushed scissor rectangle.
     */
    popScissorRect(): this;

    acquireRenderTexture(width: number, height: number): RenderTexture;
    releaseRenderTexture(texture: RenderTexture): this;

    /**
     * Composite `content` onto the active render target with each output
     * pixel's alpha multiplied by the corresponding sample of
     * `mask.alpha`. The mask is stretched-fit over the target rectangle
     * `(x, y, width, height)` in world-space. Used internally by the
     * non-Rectangle `MaskSource` paths on `RenderNode.mask`.
     */
    composeWithAlphaMask(
        content: RenderTexture,
        mask: Texture | RenderTexture,
        x: number,
        y: number,
        width: number,
        height: number,
        blendMode: BlendModes,
    ): this;

    draw(drawable: Drawable): this;
    execute(pass: RenderPass): this;
    flush(): this;
    destroy(): void;
}
