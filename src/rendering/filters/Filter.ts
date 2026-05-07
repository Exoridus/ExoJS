import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { RenderBackend } from '@/rendering/RenderBackend';

/**
 * Abstract base class for post-process filters applied to a drawable's
 * render output.
 *
 * Filters are rendered into a temporary {@link RenderTexture} (the `output`)
 * that is composited back onto the scene after all filters in the chain have
 * been applied. Subclasses implement {@link apply} to run their shader pass.
 * Stock implementations: {@link BlurFilter}, {@link ColorFilter}.
 * User-supplied GLSL/WGSL shaders: {@link WebGl2ShaderFilter},
 * {@link WebGpuShaderFilter}.
 */
export abstract class Filter {
    /**
     * Execute one filter pass: sample from `input`, write the result to
     * `output`. Both textures are the same dimensions as the filtered drawable's
     * bounding box.
     */
    public abstract apply(
        backend: RenderBackend,
        input: RenderTexture,
        output: RenderTexture,
    ): void;
}
