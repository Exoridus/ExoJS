import type { Color } from 'core/Color';
import type { RenderBackendType } from './RenderBackendType';
import type { RenderTarget } from './RenderTarget';
import type { View } from './View';
import type { Drawable } from './Drawable';
import type { RenderPass } from './RenderPass';
import type { Rectangle } from 'math/Rectangle';
import type { RenderTexture } from './texture/RenderTexture';

export interface SceneRenderRuntime {
    readonly backendType: RenderBackendType;
    readonly view: View;
    readonly renderTarget: RenderTarget;

    initialize(): Promise<this>;
    clear(color?: Color): this;
    resize(width: number, height: number): this;
    setView(view: View | null): this;
    setRenderTarget(target: RenderTarget | null): this;
    pushMask(maskBounds: Rectangle): this;
    popMask(): this;
    acquireRenderTexture(width: number, height: number): RenderTexture;
    releaseRenderTexture(texture: RenderTexture): this;
    draw(drawable: Drawable): this;
    execute(pass: RenderPass): this;
    flush(): this;
    destroy(): void;
}
