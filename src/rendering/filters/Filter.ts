import type { RenderTexture } from 'rendering/texture/RenderTexture';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';

export abstract class Filter {
    public abstract apply(
        runtime: SceneRenderRuntime,
        input: RenderTexture,
        output: RenderTexture,
    ): void;
}
