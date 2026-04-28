import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { RenderBackend } from '@/rendering/RenderBackend';

export abstract class Filter {
    public abstract apply(
        backend: RenderBackend,
        input: RenderTexture,
        output: RenderTexture,
    ): void;
}
