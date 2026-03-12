import type { Drawable } from './Drawable';
import type { IRenderBackend } from './IRenderBackend';

export enum RendererType {
    sprite = 1,
    particle = 2,
    primitive = 3,
}

export interface IRenderer {
    connect(renderManager: IRenderBackend): this;
    disconnect(): this;
    bind(): this;
    unbind(): this;
    render(drawable: Drawable): this;
    flush(): this;
    destroy(): void;
}
