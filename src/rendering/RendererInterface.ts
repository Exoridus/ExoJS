import { Drawable } from './Drawable';
import { RenderManager } from './RenderManager';

export enum RendererType {
    Sprite = 1,
    Particle = 2,
    Primitive = 3,
}

export interface RendererInterface {
    connect(renderManager: RenderManager): this;
    disconnect(): this;
    bind(): this;
    unbind(): this;
    render(drawable: Drawable): this;
    flush(): this;
    destroy(): void;
}
