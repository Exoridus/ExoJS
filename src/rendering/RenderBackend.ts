import type { Color } from '#core/Color';
import type { Signal } from '#core/Signal';
import type { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { Mesh } from '#rendering/mesh/Mesh';
import type { InstanceDataView } from '#rendering/RenderBatch';
import type { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { ColorTextureFormat } from '#rendering/types';

import type { BackendRenderPass } from './BackendRenderPass';
import type { Drawable } from './Drawable';
import type { PixelArray, PixelDataType } from './pixelPayload';
import type { PixelReadback } from './PixelReadback';
import type { RenderBackendType } from './RenderBackendType';
import type { RendererRegistry } from './RendererRegistry';
import type { RenderError } from './RenderError';
import type { RenderStats } from './RenderStats';
import type { RenderTarget } from './RenderTarget';
import type { BlendModes } from './types';
import type { View } from './View';

/** Independent support properties of one render-target color format. */
export interface ColorFormatCapabilities {
  /** Whether the format can be used as a color attachment. */
  readonly renderable: boolean;
  /** Whether the format accepts linear sampling. */
  readonly filterable: boolean;
  /** Whether fixed-function blending can write the format. */
  readonly blendable: boolean;
  /**
   * Render-target sample counts this backend can allocate storage for on
   * `format`, ascending and always containing `1`.
   *
   * A count above `1` is a promise the backend keeps end to end: reading it as
   * support and then setting {@link RenderTarget.sampleCount} makes the target
   * render multisampled and resolve into its own sampled texture. A backend
   * whose pipelines cannot carry a sample count reports `1` alone rather than
   * a count it cannot deliver.
   */
  readonly sampleCounts: readonly number[];
}

/**
 * Common interface implemented by both rendering backends
 * ({@link WebGl2Backend}, {@link WebGpuBackend}). Owns the canvas root
 * render target, exposes the active {@link View}, accepts {@link Drawable}
 * submissions, manages an offscreen render-texture pool, and exposes the
 * scissor-stack and alpha-mask compositing primitives used by
 * {@link RenderNode}'s `mask` machinery.
 *
 * Application code rarely calls this directly - high-level code submits
 * drawables via the scene graph and reads `app.backend.stats` for
 * per-frame counters. Custom backend passes (implementations of
 * {@link BackendRenderPass}) interact with the interface directly.
 * @advanced
 */
export interface RenderBackend {
  readonly backendType: RenderBackendType;
  /**
   * Whether the color-managed linear-light rendering pipeline is active.
   *
   * An extension renderer that authors its own colour (a light, a particle
   * tint, a tile tint) reads this to choose between the legacy authoring-byte
   * path and the linear-light one, exactly as the engine's own sprite/mesh/
   * text draw stages do - so a package outside Core stays in step with the
   * activation state without depending on Core's internal module layout.
   * @advanced
   */
  readonly colorPipelineEnabled: boolean;
  readonly rendererRegistry: RendererRegistry<RenderBackend>;
  readonly view: View;
  readonly renderTarget: RenderTarget;
  readonly stats: RenderStats;
  /**
   * The colour the canvas root target is cleared to each frame. Mutable in
   * place (`backend.clearColor.copy(...)`) - the new value takes effect on the
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
   * Block-compressed texture formats this device can sample, most preferred
   * first, or empty when it supports none.
   *
   * Availability is per device and per backend: desktop GPUs implement the BC
   * family, mobile GPUs ETC2 and ASTC, and WebGPU only carries a family that was
   * requested when the device was created. The order is the engine's own
   * preference ranking, identical on both backends, and is what
   * {@link AssetVariantProfile} selection ranks candidates by.
   *
   * Read it to decide what to ship or construct; binding a {@link CompressedTexture}
   * in a format absent from this list throws a {@link RenderError} with code
   * `'unsupported-format'`.
   */
  readonly supportedTextureFormats: readonly CompressedTextureFormat[];

  /**
   * Colour attachments this device accepts in one render pass - the upper bound
   * on a {@link MultiRenderTarget}'s attachment count.
   *
   * At least `1` everywhere, and `1` before the backend is initialized. WebGL2
   * reports the lower of `MAX_COLOR_ATTACHMENTS` and `MAX_DRAW_BUFFERS`, since an
   * attachment nothing can write to is not usable capacity; WebGPU reports
   * `limits.maxColorAttachments`.
   */
  readonly maxColorAttachments: number;

  /**
   * Whether this device can give each colour attachment of one draw its own
   * blend state, which is what {@link MeshMaterial.blendModes} asks for.
   *
   * `false` before the backend is initialized. WebGPU always reports `true` -
   * blend state is per target in a pipeline descriptor. WebGL2 reports whether
   * `OES_draw_buffers_indexed` is available, which desktop drivers generally
   * have and older mobile GPUs may not; a draw whose attachments would blend
   * differently throws a {@link RenderError} without it, because there is no
   * fallback that keeps what a multi-attachment pass is for.
   */
  readonly supportsPerAttachmentBlend: boolean;

  /**
   * Dispatched when the backend detects a GPU error that does not surface as a
   * synchronous exception - WGSL compilation errors, WebGPU uncaptured
   * validation/OOM/internal errors. Synchronous failures (WebGL2 shader
   * compile/link) throw {@link RenderError} from `flush()` instead and are
   * caught by the Application frame guard. Deduplicated per unique message.
   */
  readonly onRenderError: Signal<[RenderError]>;

  initialize(): Promise<this>;
  resetStats(): this;

  /**
   * Turn per-frame hardware GPU timing on or off, and report whether a hardware
   * clock is active afterwards.
   *
   * Enabling returns `false` when the device exposes no GPU timer at all
   * (`EXT_disjoint_timer_query_webgl2` is absent, or the WebGPU device carries
   * no `timestamp-query` feature). That is a capability answer, not a failure:
   * there is no software substitute, so {@link RenderStats.gpuFrameTimeMs}
   * simply stays `null` and a profiling UI should report the measurement as
   * unavailable rather than retrying.
   *
   * Timing is off by default because it allocates GPU query objects and readback
   * buffers, and it costs a timestamp pair per render pass while on. Turn it off
   * again once the profiling UI that asked for it is gone; the call is
   * idempotent in both directions.
   */
  setGpuTimingEnabled(enabled: boolean): boolean;

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
   * with matching pixel-level behavior - WebGL2 via a stencil renderbuffer,
   * WebGPU via a shared `depth24plus-stencil8` attachment and stencil-enabled
   * pipeline variants.
   */
  pushStencilClip(shape: Geometry, transform: Matrix): this;

  /**
   * Pop the most recently pushed stencil clip, restoring the previous nesting
   * level (or disabling the stencil test at the outermost level).
   */
  popStencilClip(): this;

  /** Independent render-target capabilities for the requested color format. */
  getColorFormatCapabilities(format: ColorTextureFormat): ColorFormatCapabilities;

  /** Whether a {@link RenderTexture} of the given color format can be rendered into on this backend/context. */
  supportsColorFormat(format: ColorTextureFormat): boolean;

  /**
   * Publish a {@link RenderTarget.sampleCount} target's current frame into the
   * single-sample texture everything samples that target through.
   *
   * A no-op for a target at one sample, and for one that was never rendered
   * into. Call it once per frame after the last draw into a multisample target
   * and before anything filters or samples it - the engine's own frame path
   * resolves the working target here. Depth and stencil are not resolved: a
   * multisample depth/stencil attachment has no single-sample counterpart to
   * resolve into, and nothing downstream reads it.
   */
  resolveRenderTarget(target: RenderTarget): void;

  /** Whether the format supports lossless typed readback on this backend. */
  supportsReadbackFormat(format: ColorTextureFormat): boolean;

  /**
   * Read back `width × height` RGBA components from `source`, starting at `x`, `y`
   * measured from its top-left corner, with the top row first.
   *
   * Pending work is submitted first, so the pixels are those of everything
   * drawn into `source` up to this call. Both backends resolve on the GPU's own
   * schedule rather than blocking, which is why this is asynchronous even where
   * the platform call is not.
   *
   * `uint8` accepts rgba8; `float32` accepts rgba16f/rgba32f and expands
   * half-floats without normalization. The caller must validate the format and rectangle;
   * {@link RenderingContext.readPixels} is the checked entry point.
   * @advanced
   */
  readPixels(source: RenderTexture, x: number, y: number, width: number, height: number, dataType?: 'uint8'): Promise<Uint8ClampedArray>;
  readPixels(source: RenderTexture, x: number, y: number, width: number, height: number, dataType: 'float32'): Promise<Float32Array>;
  readPixels(source: RenderTexture, x: number, y: number, width: number, height: number, dataType: PixelDataType): Promise<PixelArray>;

  /**
   * Open a standing, non-blocking readback over `width × height` pixels of
   * `source` at `x`, `y` from its top-left corner, with `slots` staging
   * buffers. The backend drains it at every frame start and invalidates it on
   * device loss; the caller destroys it. `PixelReader` is the checked,
   * caller-facing wrapper and the way application code should reach this.
   * @advanced
   */
  createPixelReadback(source: RenderTexture, x: number, y: number, width: number, height: number, slots: number, dataType?: 'uint8'): PixelReadback;
  createPixelReadback(
    source: RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    slots: number,
    dataType: 'float32',
  ): PixelReadback<Float32Array>;
  createPixelReadback(
    source: RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    slots: number,
    dataType: PixelDataType,
  ): PixelReadback<PixelArray>;

  /**
   * Borrow a temporary {@link RenderTexture} of exactly `width × height` and
   * `format` from the backend's pool, allocating one if no pooled entry
   * matches. Hand it back with {@link releaseRenderTexture} - destroying a
   * borrowed texture instead corrupts the pool.
   *
   * `format` defaults to `Rgba8`. Pass the working color
   * format explicitly for a scratch surface that carries color through a
   * filter, cache or compositor - the pool keys on it, so a mismatched
   * request never aliases a differently-formatted entry.
   */
  acquireRenderTexture(width: number, height: number, format?: ColorTextureFormat): RenderTexture;

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
   * working afterwards - {@link acquireRenderTexture} /
   * {@link releaseRenderTexture} behave exactly as before, they just start
   * from empty and re-allocate whatever intermediates are asked for next.
   *
   * This is a manual, opt-in operation, not something the engine calls on
   * your behalf. It trades pooled VRAM for a burst of re-allocation the next
   * time those sizes are needed, so call it at a point where you actually
   * want that trade: a memory-pressure signal from the platform, a long idle
   * pause, or tearing down a level whose filter/mask intermediates won't
   * recur at the same sizes. Do not call it on every scene change - that
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
   * executor for the modes {@link blendModeNeedsBackdrop} reports for the
   * destination being composited into.
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
export const sanitizeSurfacePixelRatio = (pixelRatio: number | undefined): number =>
  pixelRatio !== undefined && Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
