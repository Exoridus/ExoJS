import type { Drawable } from './Drawable';
import type { RenderManager } from './RenderManager';

export enum RendererType {
    sprite = 1,
    particle = 2,
    primitive = 3,
}

export interface IRenderer {
    connect(renderManager: RenderManager): this;
    disconnect(): this;
    bind(): this;
    unbind(): this;
    render(drawable: Drawable): this;
    flush(): this;
    destroy(): void;
}
