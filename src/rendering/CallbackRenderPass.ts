import type { SceneRenderRuntime } from './SceneRenderRuntime';
import type { RenderPass } from './RenderPass';

export class CallbackRenderPass implements RenderPass {

    private readonly _callback: (runtime: SceneRenderRuntime) => void;

    public constructor(callback: (runtime: SceneRenderRuntime) => void) {
        this._callback = callback;
    }

    public execute(runtime: SceneRenderRuntime): void {
        this._callback(runtime);
    }
}
