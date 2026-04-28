import type { RenderBackend } from './RenderBackend';
import type { RenderPass } from './RenderPass';

export class CallbackRenderPass implements RenderPass {

    private readonly _callback: (backend: RenderBackend) => void;

    public constructor(callback: (backend: RenderBackend) => void) {
        this._callback = callback;
    }

    public execute(backend: RenderBackend): void {
        this._callback(backend);
    }
}
