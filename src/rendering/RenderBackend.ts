import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { Mesh } from '#rendering/mesh/Mesh';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { ColorTextureFormat } from '#rendering/types';

import type { BackendRenderPass } from './BackendRenderPass';
import type { Drawable } from './Drawable';
import type { RenderBackendType } from './RenderBackendType';
import type { RendererRegistry } from './RendererRegistry';
import type { RenderStats } from './RenderStats';
import type { RenderTarget } from './RenderTarget';
import type { BlendModes } from './types';
import type { View } from './View';

/**
 * Common interface implemented by both rendering backends
 * ({@link WebGl2Backend}, {@link WebGpuBackend}). Owns the canvas root
 * render target, exposes the active {@link View}, accepts {@link Drawable}
 * submissions, manages an offscreen render-texture pool, and exposes the
 * scissor-stack and alpha-mask compositing primitives used by
 * {@link RenderNode}'s `mask` machinery.
 *
 * Application code rarely calls this directly — high-level code submits
 * drawables via the scene graph and reads `app.backend.stats` for
 * per-frame counters. Custom backend passes (implementations of
 * {@link BackendRenderPass}) interact with the interface directly.
 * @advanced
 */
export interface RenderBackend {
  readonly backendType: RenderBackendType;
  readonly rendererRegistry: RendererRegistry<RenderBackend>;
  readonly view: View;
  readonly renderTarget: RenderTarget;
  readonly stats: RenderStats;
  /**
   * The colour the canvas root target is cleared to each frame. Mutable in
   * place (`backend.clearColor.copy(...)`) — the new value takes effect on the
   * next frame. Both backends initialise it from `app.options.clearColor`.
   */
  readonly clearColor: Color;

  initialize(): Promise<this>;
  resetStats(): this;
  clear(color?: Color): this;
  resize(width: number, height: number): this;
  setView(view: View | null): this;
  setRenderTarget(target: RenderTarget | null): this;

  /**
   * Push an axis-aligned scissor rectangle. Used internally by the
   * `Rectangle` mask path on `RenderNode.mask`. Nested scissors
   * intersect with the previous scissor on the stack.
   */
  pushScissorRect(bounds: Rectangle): this;

  /**
   * Pop the most recently pushed scissor rectangle.
   */
  popScissorRect(): this;

  /**
   * Push a geometric stencil clip. The `shape` silhouette (transformed by
   * `transform`, the clipping node's global transform) is written into the
   * stencil buffer; subsequent draws are restricted to fragments inside the
   * shape. Nested clips intersect (ref-incremented). Used internally by the
   * `Geometry` `clipShape` path on {@link RenderNode.clip}.
   *
   * Composes freely with the scissor stack. Backends without stencil support
   * (currently WebGPU) throw a clear error rather than rendering incorrectly.
   */
  pushStencilClip(shape: Geometry, transform: Matrix): this;

  /**
   * Pop the most recently pushed stencil clip, restoring the previous nesting
   * level (or disabling the stencil test at the outermost level).
   */
  popStencilClip(): this;

  /**
   * Whether a {@link RenderTexture} of the given color format can be rendered
   * into on this backend/context. `'rgba8'` is always supported; float formats
   * depend on hardware/extension support. Check before allocating a float target.
   */
  supportsColorFormat(format: ColorTextureFormat): boolean;

  acquireRenderTexture(width: number, height: number): RenderTexture;
  releaseRenderTexture(texture: RenderTexture): this;

  /**
   * Composite `content` onto the active render target with each output
   * pixel's alpha multiplied by the corresponding sample of
   * `mask.alpha`. The mask is stretched-fit over the target rectangle
   * `(x, y, width, height)` in world-space. Used internally by the
   * non-Rectangle `MaskSource` paths on `RenderNode.mask`.
   */
  composeWithAlphaMask(content: RenderTexture, mask: Texture | RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): this;

  /**
   * Composite `source` over the active render target under an advanced
   * (backdrop-aware) blend mode. Captures the target's `[x, y, width, height]`
   * region, runs the W3C blend formula in a shader, and draws the result back
   * with normal premultiplied source-over. Used internally by the render-effect
   * executor for modes where {@link isAdvancedBlendMode} is `true`.
   */
  composeWithBackdropBlend(source: RenderTexture, x: number, y: number, width: number, height: number, mode: BlendModes): this;

  draw(drawable: Drawable): this;

  /**
   * Submit an explicit instanced batch: draw `mesh`'s geometry once with `count`
   * per-instance `(transform, tint)` pairs, written into fresh shared transform
   * slots, as a single instanced draw call. `mesh` carries the geometry,
   * material, texture and blend mode; its own transform and tint are ignored.
   * Only the first `count` entries of `transforms` / `tints` are read.
   *
   * Used internally by {@link RenderingContext.drawBatch}. The geometry must use
   * the `triangle-list` topology and the standard mesh attribute layout; a
   * supplied material must be instancing-compatible (default mesh material, or a
   * custom shader declaring `a_nodeIndex` + `u_transforms`).
   */
  drawInstanced(mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number): this;

  execute(pass: BackendRenderPass): this;
  flush(): this;
  destroy(): void;
}
