import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { TargetResolution } from '#rendering/types';

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
   * Resolution this filter's render targets are rasterized at, in device pixels
   * per logical unit.
   *
   * `'inherit'` (the default) matches the surface the result is composited into,
   * so a filtered subtree stays as sharp as its surroundings on a HiDPI display.
   * Lower it for a filter whose output is low-frequency anyway — a heavy blur at
   * `0.5` costs a quarter of the fragments and is hard to tell apart.
   *
   * A filter CHAIN shares one target size, so the whole chain runs at the lowest
   * resolution any of its filters asks for.
   *
   * ```ts
   * const blur = new BlurFilter({ radius: 8 });
   *
   * blur.resolution = 0.5; // half-resolution blur, quarter the fill cost
   * ```
   * @stable
   */
  public resolution: TargetResolution = 'inherit';

  /**
   * Execute one filter pass: sample from `input`, write the result to `output`.
   *
   * Both textures are `bounds × resolution` texels — NOT the drawable's logical
   * bounding box. Any parameter a subclass expresses in pixels (a blur radius, a
   * displacement amount) is in LOGICAL units by convention and must be
   * multiplied by `resolution` before it is used as a texel offset; otherwise the
   * effect shrinks by `1/resolution` on a HiDPI display. Parameters expressed as
   * a fraction of the target (or as pure colour maths) need no adjustment.
   *
   * The engine always passes `resolution`. It is optional for the hand-rolled
   * case — a post-processing chain that creates its own {@link RenderTexture}s
   * and calls `apply` directly — where the textures are whatever size the caller
   * made them and `1` is the honest answer.
   */
  public abstract apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution?: number): void;

  /**
   * Release any GPU-side resources held by this filter (uniform buffers,
   * pipelines, intermediate textures). Default is a no-op for stateless
   * filters; subclasses with state ({@link BlurFilter}, {@link ColorFilter})
   * override.
   */
  public destroy(): void {
    // no-op — subclasses with GPU state override
  }
}
