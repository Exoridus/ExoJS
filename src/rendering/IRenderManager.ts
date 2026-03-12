import type { Color } from 'core/Color';
import type { IRenderBackend } from './IRenderBackend';
import type { RenderTarget } from './RenderTarget';
import type { View } from './View';

export interface IRenderManager extends IRenderBackend {
    readonly renderTarget: RenderTarget;
    initialize(): Promise<this>;
    clear(color?: Color): this;
    resize(width: number, height: number): this;
    setView(view: View | null): this;
    setRenderTarget(target: RenderTarget | null): this;
    display(): this;
    destroy(): void;
}
