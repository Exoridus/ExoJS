import type { SceneRenderRuntime } from './SceneRenderRuntime';

export interface RenderPass {
    execute(runtime: SceneRenderRuntime): void;
}
