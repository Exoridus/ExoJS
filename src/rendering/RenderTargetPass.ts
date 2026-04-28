import type { Color } from '@/core/Color';
import type { View } from './View';
import type { RenderTarget } from './RenderTarget';
import type { RenderPass } from './RenderPass';
import type { RenderBackend } from './RenderBackend';

export interface RenderTargetPassOptions {
    readonly target?: RenderTarget | null;
    readonly view?: View | null;
    readonly clearColor?: Color;
}

export class RenderTargetPass implements RenderPass {

    private readonly _callback: (backend: RenderBackend) => void;
    private readonly _target: RenderTarget | null;
    private readonly _view: View | null;
    private readonly _clearColor: Color | null;

    public constructor(
        callback: (backend: RenderBackend) => void,
        options: RenderTargetPassOptions = {},
    ) {
        this._callback = callback;
        this._target = options.target ?? null;
        this._view = options.view ?? null;
        this._clearColor = options.clearColor ?? null;
    }

    public execute(backend: RenderBackend): void {
        const previousTarget = backend.renderTarget;
        const previousView = backend.view;

        backend.setRenderTarget(this._target);
        backend.setView(this._view);

        if (this._clearColor !== null) {
            backend.clear(this._clearColor);
        }

        try {
            this._callback(backend);
        } finally {
            backend.setRenderTarget(previousTarget);
            backend.setView(previousView);
        }
    }
}
