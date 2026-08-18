import type { Color } from '#core/Color';
import type { Signal } from '#core/Signal';
import type { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { Mesh } from '#rendering/mesh/Mesh';
import type { InstanceDataView } from '#rendering/RenderBatch';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { ColorTextureFormat } from '#rendering/types';

import type { BackendRenderPass } from './BackendRenderPass';
import type { Drawable } from './Drawable';
import type { RenderBackendType } from './RenderBackendType';
import type { RendererRegistry } from './RendererRegistry';
import type { RenderError } from './RenderError';
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

  /**
   * Device pixels per logical unit of the canvas root target - the
   * application's effective `pixelRatio`.
   *
   * The root target is sized in LOGICAL units while the canvas backing store is
   * `logical × pixelRatio`, so this is the ratio between them. It is the
   * resolution an effect or cache target inherits when nothing overrides it (see
   * {@link TargetResolution}); without it an internal target would be pinned at
   * 1 and rasterize at `1/pixelRatio` of the detail it is sampled over.
   */
  readonly rootResolution: number;

  /**
   * Largest texture extent, in texels, this device accepts on either axis
   * (`gl.MAX_TEXTURE_SIZE` / `maxTextureDimension2D`).
   *
   * Read by the plan builder to clamp a barrier's resolution so a large filtered
   * subtree on a high-ratio display cannot ask for a texture the device would
   * refuse.
   */
  readonly maxTextureSize: number;

  /**
   * Dispatched when the backend detects a GPU error that does not surface as a
   * synchronous exception — WGSL compilation errors, WebGPU uncaptured
   * validation/OOM/internal errors. Synchronous failures (WebGL2 shader
   * compile/link) throw {@link RenderError} from `flush()` instead and are
   * caught by the Application frame guard. Deduplicated per unique message.
   */
  readonly onRenderError: Signal<[RenderError]>;

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
   * Composes freely with the scissor stack. Both backends implement this
   * with matching pixel-level behavior — WebGL2 via a stencil renderbuffer,
   * WebGPU via a shared `depth24plus-stencil8` attachment and stencil-enabled
   * pipeline variants.
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

  /**
   * Borrow a temporary {@link RenderTexture} of exactly `width × height` from
   * the backend's pool, allocating one if no pooled entry matches. Hand it back
   * with {@link releaseRenderTexture} — destroying a borrowed texture instead
   * corrupts the pool.
   */
  acquireRenderTexture(width: number, height: number): RenderTexture;

  /**
   * Return a borrowed render texture for reuse. The pool is bounded in both
   * entry count and total bytes, so a workflow whose intermediates resize every
   * frame retires dead size classes instead of hoarding them: the least recently
   * released entries are destroyed once either cap is exceeded. Never touch the
   * texture again after releasing it.
   */
  releaseRenderTexture(texture: RenderTexture): this;

  /**
   * Destroy every render texture currently sitting in the backend's reuse
   * pool and empty it, freeing the VRAM they hold. The pool itself keeps
   * working afterwards — {@link acquireRenderTexture} /
   * {@link releaseRenderTexture} behave exactly as before, they just start
   * from empty and re-allocate whatever intermediates are asked for next.
   *
   * This is a manual, opt-in operation, not something the engine calls on
   * your behalf. It trades pooled VRAM for a burst of re-allocation the next
   * time those sizes are needed, so call it at a point where you actually
   * want that trade: a memory-pressure signal from the platform, a long idle
   * pause, or tearing down a level whose filter/mask intermediates won't
   * recur at the same sizes. Do not call it on every scene change — that
   * would defeat the pool and reintroduce the allocation churn it exists to
   * avoid.
   */
  trimRenderTexturePool(): this;

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
  drawInstanced(mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number, instances?: InstanceDataView | null): this;

  execute(pass: BackendRenderPass): this;
  flush(): this;
  destroy(): void;
}

/**
 * Sanitize a configured `canvas.pixelRatio` into a usable raster density.
 *
 * A backend built from a stand-in application object (a test, a probe page, a
 * canvas measured before layout) may be handed nothing, a zero or a `NaN`. A
 * glyph atlas is keyed on this number and sized by it, so a bad value must
 * collapse to the logical-pixel default here rather than mint an unusable
 * cache entry several layers down.
 */
export function sanitizeSurfacePixelRatio(pixelRatio: number | undefined): number {
  return pixelRatio !== undefined && Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
}
