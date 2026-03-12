import type { Color } from 'core/Color';
import type { IRenderBackend } from './IRenderBackend';
import type { RenderTarget } from './RenderTarget';

export interface IRenderManager extends IRenderBackend {
    initialize(): Promise<this>;
    clear(color?: Color): this;
    resize(width: number, height: number): this;
    setRenderTarget(target: RenderTarget | null): this;
    display(): this;
    destroy(): void;
}
