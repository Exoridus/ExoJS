import type { Color } from 'core/Color';
import type { RenderBackend } from './RenderBackend';
import type { RenderTarget } from './RenderTarget';
import type { View } from './View';

export interface RenderRuntime extends RenderBackend {
    readonly renderTarget: RenderTarget;
    initialize(): Promise<this>;
    clear(color?: Color): this;
    resize(width: number, height: number): this;
    setView(view: View | null): this;
    setRenderTarget(target: RenderTarget | null): this;
    display(): this;
    destroy(): void;
}
