import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';

export enum RendererType {
    sprite = 1,
    particle = 2,
    primitive = 3,
}

export interface Renderer {
    connect(renderManager: RenderBackend): this;
    disconnect(): this;
    bind(): this;
    unbind(): this;
    render(drawable: Drawable): this;
    flush(): this;
    destroy(): void;
}
