import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';

export enum RendererType {
    Sprite = 1,
    Particle = 2,
    Primitive = 3,
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
