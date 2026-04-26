import type { Color } from '@/core/Color';
import type { View } from './View';
import type { RenderTarget } from './RenderTarget';
import type { RenderPass } from './RenderPass';
import type { SceneRenderRuntime } from './SceneRenderRuntime';

export interface RenderTargetPassOptions {
    readonly target?: RenderTarget | null;
    readonly view?: View | null;
    readonly clearColor?: Color;
}

export class RenderTargetPass implements RenderPass {

    private readonly _callback: (runtime: SceneRenderRuntime) => void;
    private readonly _target: RenderTarget | null;
    private readonly _view: View | null;
    private readonly _clearColor: Color | null;

    public constructor(
        callback: (runtime: SceneRenderRuntime) => void,
        options: RenderTargetPassOptions = {},
    ) {
        this._callback = callback;
        this._target = options.target ?? null;
        this._view = options.view ?? null;
        this._clearColor = options.clearColor ?? null;
    }

    public execute(runtime: SceneRenderRuntime): void {
        const previousTarget = runtime.renderTarget;
        const previousView = runtime.view;

        runtime.setRenderTarget(this._target);
        runtime.setView(this._view);

        if (this._clearColor !== null) {
            runtime.clear(this._clearColor);
        }

        try {
            this._callback(runtime);
        } finally {
            runtime.setRenderTarget(previousTarget);
            runtime.setView(previousView);
        }
    }
}
