/// <reference types="@webgpu/types" />

import type { Application, CanvasAlphaMode } from '#core/Application';
import { Color } from '#core/Color';
import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';
import type { TextureSource } from '#core/types';
import { type Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { get2dContext, getWebGpuContext, type RenderSurface } from '#platform/RenderSurface';
import { assertLiveRenderTarget, assertLiveTexture } from '#rendering/assertLiveResource';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import { dataTextureBytesPerPixel, estimateTextureBytes, GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { Mesh } from '#rendering/mesh/Mesh';
import { assertDrawsAllAttachments, assertSingleAttachmentCompose } from '#rendering/multiAttachmentGuard';
import { isMultiAttachmentTarget, MultiRenderTarget } from '#rendering/MultiRenderTarget';
import type { PersistentSlotBundle } from '#rendering/plan/persistentSlotDraw';
import { type DrawCommand, drawCommandUsesSharedTransform, RenderEntryKind } from '#rendering/plan/renderCommand';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import type { ScopeEntry } from '#rendering/plan/RenderScope';
import {
  type RetainedBatchInstruction,
  retainedGenerationUnstamped,
  RetainedInstructionKind,
  type RetainedInstructionSet,
  stampRetainedBatchGeneration,
} from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { sanitizeSurfacePixelRatio } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { InstanceDataView } from '#rendering/RenderBatch';
import type { Renderer } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';
import { formatShaderError, RenderError, type RenderErrorCode } from '#rendering/RenderError';
import type { RenderStats } from '#rendering/RenderStats';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexturePool } from '#rendering/RenderTexturePool';
import { compressedPayloadOf } from '#rendering/texture/compressedPayload';
import { compressedBlockLayout, compressedBlocksAcross, compressedBlocksDown, type CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { DataTexture, type DataTextureFormat } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { type SamplerOptions, samplerStateKey } from '#rendering/texture/TextureOptions';
import type { BlendModes, ColorTextureFormat } from '#rendering/types';
import { ScaleModes, TextureFormat, WrapModes } from '#rendering/types';
import { createCanvas } from '#rendering/utils';
import type { View } from '#rendering/View';

import { readWebgpuCompressedFormats, type WebgpuCompressedFormatSupport, webgpuCompressedTextureFeatures } from './compressedFormat';
import {
  retainedTintSlotBytes,
  retainedTransformSlotBytes,
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedGeometryRef,
  type WebGpuRetainedNodeIndexRange,
} from './retainedGroupResources';
import mipmapWgslModule from './shaders/mipmap.wgsl';
import { WEBGPU_DEFAULT_MAX_TEXTURE_DIMENSION_2D } from './storageLimits';
import { WebGpuBackdropBlendCompositor } from './WebGpuBackdropBlendCompositor';
import { WebGpuGpuTimer } from './WebGpuGpuTimer';
import { WebGpuMaskCompositor } from './WebGpuMaskCompositor';
import { WebGpuMeshRenderer } from './WebGpuMeshRenderer';
import { WebGpuPassCoordinator } from './WebGpuPassCoordinator';
import type { WebGpuPersistentSlotCapableRenderer, WebGpuPersistentSlotStore } from './WebGpuPersistentSlotStore';
import { WebGpuRetainedCaptureFrame } from './WebGpuRetainedCaptureFrame';
import { WebGpuRetainedGroupBundle } from './WebGpuRetainedGroupBundle';
import { baseSpriteBatchTextureSlots, maxSpriteBatchTextureSlots } from './WebGpuSpriteRenderer';
import { WebGpuTransformStorage } from './WebGpuTransformStorage';

interface ManagedWebGpuTextureState {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
  /**
   * Sampling state `sampler` was resolved for. Tracked separately from
   * `version` so a content re-upload does not re-resolve the sampler and a
   * filter/wrap change does not force a re-upload.
   */
  samplerKey: number;
  version: number;
  width: number;
  height: number;
  mipLevelCount: number;
  /**
   * The GPU format the texture object was created with. A texture handle can
   * change format across its life - an empty loader handle becomes either a
   * managed RGBA8 upload or a compressed payload - and a format is fixed at
   * creation, so this is what decides whether the object has to be rebuilt.
   */
  format: GPUTextureFormat;
  hasContent: boolean;
  /** GPU bytes currently booked for this texture's storage with the resource accountant. */
  accountedBytes: number;
  /**
   * Reusable packing buffer for a partial `DataTexture` upload (see
   * `_syncTexture`'s partial branch), sized to the largest region packed so
   * far and never shrunk. Kept per-texture (not a shared backend scratch) so
   * concurrently-tracked `DataTexture`s (e.g. the transform + tint pair, each
   * syncing every flush of a barrier-heavy scene) never race over one buffer.
   * `null` until the first partial upload; the array kind narrows to the
   * texture's own buffer kind (`Float32Array` for `rgba32f`/`r32f`, `Uint8Array`
   * for `rgba8`/`r8`) and never changes for a given texture instance.
   */
  partialUploadScratch: Float32Array | Uint8Array | null;
  /**
   * Cached exact-length view over `partialUploadScratch` for the region size
   * last uploaded. Keeps a steady-state partial upload (same region size every
   * sync) allocation-free instead of minting a fresh `subarray` per call.
   * Invalidated whenever the backing scratch is replaced.
   */
  partialUploadView: Float32Array | Uint8Array | null;
  /**
   * Cached exact-length view over the texture's own buffer for the last
   * full-width dirty region. Full-width rows need no packing at all (see
   * `_syncTexture`'s partial branch), so this view replaces the scratch
   * entirely; caching it keeps a steady-state band - the transform/tint pair's
   * usual shape - allocation-free.
   */
  contiguousUploadView: Float32Array | Uint8Array | null;
  /**
   * The `(view, sampler)` pair `getTextureBinding` hands out for this texture
   * when no material sampler override is in play. Owned by the state and
   * refreshed in place rather than minted per call: the renderers resolve one
   * binding per bound texture per draw, so a fresh two-field literal there was
   * the last per-draw allocation left in the sprite path - ~20 KB/frame on a
   * 1000-flush frame.
   */
  binding: { view: GPUTextureView; sampler: GPUSampler };
}

interface PixelClipBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Key offset marking a non-filterable sampler. Sits above the packed scale/wrap
 * enums so it cannot collide with a filterable state.
 */
const NON_FILTERABLE_SAMPLER_KEY_BIT = 0x1_0000_0000;

const managedTextureFormat: GPUTextureFormat = 'rgba8unorm';
// Managed content + render textures use rgba8unorm = 4 bytes/px.
const MANAGED_TEXTURE_BYTES_PER_PIXEL = 4;

/** WGSL source for the box-filter mipmap-generation pipeline. @internal */
export const mipmapWgsl: string = mipmapWgslModule;

/**
 * WebGPU implementation of {@link RenderBackend}. Manages the GPU device,
 * canvas context configuration, format selection, managed-texture cache
 * (sized + format-aware), pre-warmed render pipelines per (blend-mode ×
 * format) combination, the scissor stack, and a mipmap-generation
 * compute path. Dispatches draws to per-drawable WebGPU renderers
 * registered in the {@link RendererRegistry}.
 *
 * Detects device loss via the platform's `device.lost` Promise and
 * automatically attempts recovery: drops dead GPU state, requests a
 * fresh adapter+device with exponential backoff (up to 5 tries), then
 * fires {@link WebGpuBackend.onDeviceRestored}. While recovering, draw
 * submissions silently no-op so user code survives transient outages
 * without explicit error handling. If every retry fails, a
 * {@link RenderError} with code `'device-recovery-failed'` (carrying every
 * attempt's cause as an `AggregateError`) is dispatched through
 * {@link WebGpuBackend.onRenderError} instead of leaving the canvas dead
 * with no signal.
 *
 * Initialization is async ({@link WebGpuBackend.initialize}); the
 * {@link Application} class drives that during `start()` and
 * automatically falls back to {@link WebGl2Backend} when adapter
 * acquisition fails on `'auto'`.
 */
export class WebGpuBackend implements RenderBackend {
  public readonly backendType = RenderBackendType.WebGpu;
  public readonly rendererRegistry: RendererRegistry<WebGpuBackend> = new RendererRegistry<WebGpuBackend>();
  public readonly onDeviceLost = new Signal<[GPUDeviceLostInfo]>();
  public readonly onDeviceRestored = new Signal();
  /**
   * See {@link RenderBackend.onRenderError}. Dispatched (deduplicated per
   * unique `code + message`) for WGSL compilation errors detected via
   * `getCompilationInfo()` and for the device's `uncapturederror` events
   * (validation / out-of-memory / internal).
   */
  public readonly onRenderError = new Signal<[RenderError]>();

  private readonly _canvas: RenderSurface;
  // Browser-side composite mode of the root canvas. Read once at construction
  // and re-applied by every `context.configure()`, including the one that
  // follows device-loss recovery.
  private readonly _alphaMode: CanvasAlphaMode;
  /** The application's `canvas.pixelRatio`, sanitized once - see {@link surfacePixelRatio}. */
  private readonly _surfacePixelRatio: number;
  private readonly _rootRenderTarget: RenderTarget;
  private _clearColor: Color = new Color();
  private _deviceLost = false;
  private _isRecovering = false;
  private _destroyed = false;
  private _recoveryAttempt = 0;
  private _maxRecoveryAttempts = 5;
  private _recoveryBackoffMs = 100;
  private readonly _textureStates: Map<Texture | RenderTexture, ManagedWebGpuTextureState> = new Map<Texture | RenderTexture, ManagedWebGpuTextureState>();
  private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
  private readonly _textureReleaseHandlers: Map<Texture, () => void> = new Map<Texture, () => void>();
  /**
   * Device-local samplers, interned by sampling state. Shared by the managed
   * texture path and by material sampler overrides so one state never yields
   * two devices objects.
   */
  private readonly _samplers = new Map<number, GPUSampler>();
  private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
  private readonly _renderTexturePool: RenderTexturePool = new RenderTexturePool();
  /**
   * Resolved scissor rectangles in target pixels, innermost at
   * `_clipDepth - 1`. Grow-only and reused; {@link _clipDepth}, not `length`,
   * says how many are live. See the WebGL2 backend's copy of this comment for
   * why: a clip push happens once per clipped or masked barrier per frame.
   */
  private readonly _clipPixelStack: PixelClipBoundsState[] = [];
  private _clipDepth = 0;
  /** Scratch for the incoming rect before it is intersected into its slot. */
  private readonly _clipPixelScratch: PixelClipBoundsState = { x: 0, y: 0, width: 0, height: 0 };
  private readonly _clipPointA: Vector = new Vector();
  private readonly _clipPointB: Vector = new Vector();
  private readonly _maskCompositor: WebGpuMaskCompositor = new WebGpuMaskCompositor();
  private _maskCompositorConnected = false;
  private readonly _backdropBlendCompositor: WebGpuBackdropBlendCompositor = new WebGpuBackdropBlendCompositor();
  private _backdropBlendCompositorConnected = false;
  private _mipmapShaderModule: GPUShaderModule | null = null;
  private _mipmapBindGroupLayout: GPUBindGroupLayout | null = null;
  private _mipmapPipelineLayout: GPUPipelineLayout | null = null;
  private _mipmapPipeline: GPURenderPipeline | null = null;
  private _mipmapSampler: GPUSampler | null = null;
  private _context: GPUCanvasContext | null = null;
  private _device: GPUDevice | null = null;
  /**
   * Compressed-format table of the granted device. Empty until the device
   * exists, so a format query made before initialization reports nothing
   * supported rather than claiming a family the device may never carry.
   */
  private _compressedFormats: WebgpuCompressedFormatSupport = { formats: [], gpuFormats: new Map() };
  private _format: GPUTextureFormat | null = null;
  // `copyExternalImageToTexture` from a <canvas> source: `null` while unknown
  // (never probed yet), `true`/`false` once the one-off probe below resolves.
  // See `_probeCanvasExternalImageCopy` for why this is measured instead of
  // assumed.
  private _canvasExternalImageCopySupported: boolean | null = null;
  private _canvasExternalImageCopyProbeStarted = false;
  private _initializePromise: Promise<this> | null = null;
  private _renderTarget: RenderTarget;
  // Reused scratch for the device-pixel snap viewport rect (see _snapViewport).
  private readonly _snapViewportRect = { x: 0, y: 0, width: 0, height: 0 };
  /** Reused record handed out by `_getAttachmentPixelSize` - see the contract there. */
  private readonly _attachmentPixelSize = { width: 0, height: 0 };
  /** Reused colour attachment + its clear value - see `createColorAttachment`. */
  private readonly _clearValue = { r: 0, g: 0, b: 0, a: 0 };
  private readonly _colorAttachment: GPURenderPassColorAttachment = {
    view: undefined as unknown as GPUTextureView,
    clearValue: this._clearValue,
    loadOp: 'load',
    storeOp: 'store',
  };
  /**
   * Extra reusable attachment records for a MultiRenderTarget, one per slot
   * beyond the first. Pooled for the same reason the first one is: a pass is
   * opened many times per frame and the records do not outlive beginRenderPass.
   */
  private readonly _extraColorAttachments: GPURenderPassColorAttachment[] = [];
  /** Reused list backing `renderTargetFormats`; refilled in place on every read. */
  private readonly _formatScratch: GPUTextureFormat[] = ['rgba8unorm'];
  /** Load op slot 0 resolved for the pass being opened; the other slots follow it. */
  private _loadOpForPass: GPULoadOp = 'load';
  /** Whether the bound target writes more than one colour attachment - see `draw`. */
  private _multiAttachmentTarget = false;
  /** Reused one-element command-buffer list for `submit`. */
  private readonly _submitBatch: GPUCommandBuffer[] = [undefined as unknown as GPUCommandBuffer];
  private _renderer: Renderer | null = null;
  private _renderGroupTransform: Matrix | null = null;
  private _renderGroupTransformId = 0;
  private _texture: Texture | RenderTexture | null = null;
  private _clearRequested = false;
  private _hasPresentedFrame = false;
  private readonly _stats: RenderStats = createRenderStats();
  private readonly _accountant: GpuResourceAccountant = new GpuResourceAccountant(this._stats);
  private _transformStorage: WebGpuTransformStorage | null = new WebGpuTransformStorage();
  private _activeDrawCommand: DrawCommand | null = null;
  private _passCoordinatorInstance: WebGpuPassCoordinator | null = null;
  /** Non-null only while GPU timing is enabled; its query set belongs to the current device. */
  private _gpuTimer: WebGpuGpuTimer | null = null;
  /** Kept separately from `_gpuTimer` so a device recovery can re-arm timing that was asked for. */
  private _gpuTimingRequested = false;
  private _drawPlanDepth = 0;
  private readonly _planBaseStack: number[] = [];
  private readonly _planHashStack: number[] = [];
  private _renderPlanEpoch = 0;
  // Retained instruction-set record/replay.
  // Active capture windows, innermost last; live bundle registry for
  // device-loss generation bumps; permanently vetoed (poisoned) sets.
  private readonly _retainedCaptureFrames: WebGpuRetainedCaptureFrame[] = [];
  private readonly _retainedBundles = new Set<WebGpuRetainedGroupBundle>();
  /**
   * Live persistent slot stores, so a device loss can invalidate every one of
   * them - their buffers belong to the device that just went away.
   */
  private readonly _persistentStores = new Set<WebGpuPersistentSlotStore>();
  private readonly _rejectedRetainedSets = new WeakSet<RetainedInstructionSet>();
  // Reused across per-batch scans at record time to avoid an
  // allocation per flush; the renderer-agnostic counterpart of WebGL2's
  // capture-end `_retainedIndexRange` (WebGPU scans per batch, not per capture).
  private readonly _retainedBatchIndexRange: WebGpuRetainedNodeIndexRange = { min: 0, max: 0 };
  // Render-error surface: dedupe keys for onRenderError, and
  // the bound uncapturederror listener (re-installed by _initialize after
  // device-loss recovery).
  private readonly _reportedErrorKeys = new Set<string>();
  private readonly _onUncapturedError = (event: Event): void => {
    this._handleUncapturedError((event as GPUUncapturedErrorEvent).error);
  };

  public constructor(app: Application) {
    const canvasOptions = app.options.canvas ?? {};
    const width = canvasOptions.width ?? 800;
    const height = canvasOptions.height ?? 600;
    const clearColor = app.options.clearColor;

    this._alphaMode = app.options.rendering?.alphaMode ?? 'opaque';
    this._canvas = app.canvas;
    this._surfacePixelRatio = sanitizeSurfacePixelRatio(canvasOptions.pixelRatio);
    this._rootRenderTarget = new RenderTarget(width, height, true);
    this._renderTarget = this._rootRenderTarget;

    if (clearColor) {
      this._clearColor.copy(clearColor);
    }

    // Core renderers are bound via buildCoreRendererBindings in Application.createBackend.
    this.resize(width, height);
  }

  public get view(): View {
    return this._renderTarget.view;
  }

  public get renderTarget(): RenderTarget {
    return this._renderTarget;
  }

  /**
   * Device pixels per logical unit of the canvas root target.
   *
   * Derived rather than stored: the root target carries the LOGICAL size while
   * the canvas backing store carries `logical × pixelRatio`, so the ratio
   * between them is always current - including after a `resize()` that changes
   * only one of the two.
   */
  public get rootResolution(): number {
    const logicalWidth = this._rootRenderTarget.width;

    return logicalWidth > 0 ? this._canvas.width / logicalWidth : 1;
  }

  /**
   * The application's configured `canvas.pixelRatio`.
   *
   * Deliberately NOT {@link rootResolution}, even though the two agree while
   * the logical view and the render resolution are the same size. This is the
   * number a rasterizer keys a cache on, and it has to be stable and quantized
   * to be safe there: a sizing policy that holds the logical view while the
   * backing store follows the host makes `rootResolution` an arbitrary float
   * that moves on every window resize, and keying a glyph atlas on it would
   * mint a fresh set of pages per resize step.
   */
  public get surfacePixelRatio(): number {
    return this._surfacePixelRatio;
  }

  /**
   * `maxTextureDimension2D` of the granted device.
   *
   * The spec DEFAULT stands in when no limits object is reachable - a device
   * that exposes none is either a test double or non-conformant, and a
   * conformant device is never granted less, so assuming the default is the safe
   * direction (the same rule `webgpuStorageLimits` follows).
   */
  public get maxTextureSize(): number {
    const limits = (this._device as { limits?: GPUSupportedLimits } | null)?.limits;

    return limits?.maxTextureDimension2D ?? WEBGPU_DEFAULT_MAX_TEXTURE_DIMENSION_2D;
  }

  public get supportedTextureFormats(): readonly CompressedTextureFormat[] {
    return this._compressedFormats.formats;
  }

  public get maxColorAttachments(): number {
    const limits = (this._device as { limits?: GPUSupportedLimits } | null)?.limits;
    const reported = limits?.maxColorAttachments;

    return typeof reported === 'number' && reported > 0 ? reported : 1;
  }

  public get device(): GPUDevice {
    if (this._device === null) {
      throw new Error('WebGPU device is not initialized yet.');
    }

    return this._device;
  }

  public get context(): GPUCanvasContext {
    if (this._context === null) {
      throw new Error('WebGPU canvas context is not initialized yet.');
    }

    return this._context;
  }

  public get format(): GPUTextureFormat {
    if (this._format === null) {
      throw new Error('WebGPU canvas format is not initialized yet.');
    }

    return this._format;
  }

  public get renderTargetFormat(): GPUTextureFormat {
    if (this._renderTarget === this._rootRenderTarget) {
      return this.format;
    }

    // Offscreen targets carry their own color format (rgba8unorm by default, or a
    // float format for a float RenderTexture). Renderers key their pipelines on
    // this, so it must match the bound attachment or WebGPU rejects the draw.
    if (this._renderTarget instanceof RenderTexture) {
      return this._getGpuTextureFormat(this._renderTarget);
    }

    if (this._renderTarget instanceof MultiRenderTarget) {
      return this._getGpuTextureFormat(this._renderTarget.attachment(0));
    }

    return managedTextureFormat;
  }

  /**
   * Colour format of every attachment of the bound target, in slot order.
   *
   * A pipeline must declare one target per attachment of the pass it runs in, so a
   * renderer that can draw into a multi-attachment target keys its pipelines on
   * all of these rather than on renderTargetFormat alone. Single-target renderers
   * keep reading the singular getter, which stays the first slot.
   * @internal
   */
  public get renderTargetFormats(): readonly GPUTextureFormat[] {
    const target = this._renderTarget;
    // Filled in place rather than mapped: this is read once per custom-material
    // draw, and a fresh array there would be per-draw garbage.
    const formats = this._formatScratch;

    if (target instanceof MultiRenderTarget) {
      const attachments = target.attachments;

      formats.length = attachments.length;

      for (let index = 0; index < attachments.length; index++) {
        formats[index] = this._getGpuTextureFormat(attachments[index]!);
      }

      return formats;
    }

    formats.length = 1;
    formats[0] = this.renderTargetFormat;

    return formats;
  }

  /** Colour attachments the bound target contributes to a pass. */
  public get colorAttachmentCount(): number {
    const target = this._renderTarget;

    return target instanceof MultiRenderTarget ? target.attachments.length : 1;
  }

  /**
   * Whether the root canvas composites without an alpha channel. Only then may a
   * root target be treated as a fully covered backdrop: under
   * `alphaMode: 'premultiplied'` the canvas carries real alpha, so an untouched
   * region genuinely has no coverage.
   *
   * The configured mode is the authority here - WebGPU has no equivalent of
   * WebGL's `getContextAttributes()`, and this is the same value that goes into
   * `context.configure()`.
   * @internal
   */
  public get _rootCanvasOpaque(): boolean {
    return this._alphaMode === 'opaque';
  }

  public get clearRequested(): boolean {
    return this._clearRequested;
  }

  public get stats(): RenderStats {
    return this._stats;
  }

  /**
   * Per-backend GPU resource accountant (VRAM / upload / download bookkeeping).
   * Shared with this backend's transform storage and compute readback paths so
   * they can book their own allocations and uploads. Not part of any public
   * surface.
   * @internal
   */
  public get accountant(): GpuResourceAccountant {
    return this._accountant;
  }

  /**
   * The draw command currently being submitted through the render-plan
   * player, or `null` outside of one. Part of the renderer SDK contract for
   * extension renderers.
   */
  public get activeDrawCommand(): DrawCommand | null {
    return this._activeDrawCommand;
  }

  /**
   * Internal render-pass coordinator. Owns the clear-vs-load decision and the
   * active render pass; not part of the public
   * {@link RenderBackend} surface.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public get _passCoordinator(): WebGpuPassCoordinator {
    if (this._passCoordinatorInstance === null) {
      this._passCoordinatorInstance = new WebGpuPassCoordinator(this);
      // A coordinator first reached after timing was enabled has to inherit the
      // timer, or the frame's passes go unbracketed and the frame reads as 0.
      this._passCoordinatorInstance.gpuTimer = this._gpuTimer;
    }

    return this._passCoordinatorInstance;
  }

  public get clearColor(): Color {
    return this._clearColor;
  }

  public get deviceLost(): boolean {
    return this._deviceLost;
  }

  public setClearColor(color: Color): this {
    this._clearColor.copy(color);

    return this;
  }

  public initialize(): Promise<this> {
    if (!this._initializePromise) {
      this._initializePromise = this._initialize().catch((error: unknown) => {
        this._initializePromise = null;
        throw error;
      });
    }

    return this._initializePromise;
  }

  public resetStats(): this {
    resetRenderStats(this._stats);
    // The transform buffer is frame-scoped: reset it once per frame here (was
    // previously reset per render() call in _beginDrawPlan).
    this._getTransformStorage().buffer.begin();
    this._gpuTimer?.beginFrame();

    return this;
  }

  public setGpuTimingEnabled(enabled: boolean): boolean {
    this._gpuTimingRequested = enabled;

    if (!enabled) {
      this._gpuTimer?.destroy();
      this._setGpuTimer(null);
      this._stats.gpuFrameTimeMs = null;

      return false;
    }

    if (this._gpuTimer === null && this._device !== null && !this._deviceLost) {
      this._setGpuTimer(WebGpuGpuTimer.create(this._device));
    }

    return this._gpuTimer !== null;
  }

  /** Frame-global slot base the plan builder indexes from. @internal */
  public get transformBufferCount(): number {
    return this._getTransformStorage().buffer.count;
  }

  /** Monotonic render-plan token for per-material replay deduplication. @internal */
  public get renderPlanEpoch(): number {
    return this._renderPlanEpoch;
  }

  /** @internal */
  public _beginDrawPlan(nodeCount: number): void {
    this._renderPlanEpoch++;
    const storage = this._getTransformStorage();

    // Do NOT reset the transform buffer here - it is frame-scoped (reset in
    // resetStats). The builder already based this plan's node indices at the
    // current buffer count, so writes land in fresh frame-global slots and
    // batches survive across render() calls. Remember this plan's base so a
    // nested plan can free its rows on end.
    this._planBaseStack.push(storage.buffer.count);
    this._planHashStack.push(storage.buffer.frameHash);

    // Pre-allocate the GPU storage buffer for the full plan before any group
    // flush runs. Base the reservation on the frame-global count + this plan's
    // nodes so the buffer grows to cover both pre-existing frame rows and new rows.
    const reserveCount = storage.buffer.count + nodeCount;

    if (reserveCount > 0 && this._device !== null && !this._deviceLost) {
      // Growing the shared transform storage destroys the current GPU buffer.
      // With the frame now submitted once, an earlier render() call this frame
      // can have left a pass open whose recorded draws still bind that buffer;
      // freeing it under them invalidates the whole merged command buffer at the
      // next submit. End (submit) the open pass first when a growth is imminent,
      // mirroring the renderers' flush-time `wouldGrow` guard (which runs too
      // late here - `reserve` frees the buffer before any renderer flushes).
      if (this._passCoordinatorInstance?.hasActivePass === true && storage.wouldGrow(reserveCount)) {
        this._flushActiveRendererAndEndPass();
      }

      storage.reserve(this._device, reserveCount, this._accountant);
    }

    this._activeDrawCommand = null;
    this._drawPlanDepth++;
  }

  /** @internal */
  public _prepareRenderGroupUpload(entries: readonly ScopeEntry[], startIndex: number, count: number): void {
    // Pack the whole render group's world transforms (+ tint) into the shared
    // transform storage at the group's upload boundary, keyed by each draw
    // command's stable nodeIndex. Every draw the player will submit for this
    // group is covered here, before the group's first draw.
    //
    // The group is the entries range `[startIndex, startIndex + count)`; every
    // entry in it is a draw, so the player no longer materializes a group array.
    //
    // Renderers that pack their own per-node data (Text, Particle) never read
    // the shared storage, so their commands are skipped - no consuming draw
    // ever references their slots (nodeIndex is unique per command).
    const storage = this._getTransformStorage();
    const end = startIndex + count;

    for (let i = startIndex; i < end; i++) {
      const entry = entries[i]!;

      // Every entry in a group run is a draw; narrow to read its command.
      if (entry.kind !== RenderEntryKind.Draw) {
        continue;
      }

      const command = entry.command;

      if (drawCommandUsesSharedTransform(command, this)) {
        // Upload the RAW world transform + snap-mode flag; the vertex stage snaps
        // the device-pixel origin. No CPU snap at this seam anymore.
        storage.writeCommand(command, undefined, command.drawable.pixelSnapMode);
      } else {
        storage.recordSkippedWrite();
      }
    }
  }

  /**
   * Allocate a persistent slot store for `source`, or refuse it.
   *
   * The backend's own check is narrow: every item in the source must resolve to
   * ONE renderer, and that renderer must implement the indexed path. Everything
   * beyond that - materials, blend modes, the texture table - is the renderer's
   * rule, so the decision is delegated rather than duplicated here.
   *
   * Called once per built source. A refusal is remembered by the caller, so the
   * walk below never runs per frame.
   * @internal
   */
  public _acquirePersistentSlots(source: RenderRootSource): PersistentSlotBundle | null {
    if (this._deviceLost || this._device === null) {
      return null;
    }

    let owner: WebGpuPersistentSlotCapableRenderer | null = null;

    for (const scope of source.scopes) {
      const drawables = scope.items.drawables;
      const count = scope.items.count;

      for (let i = 0; i < count; i++) {
        let renderer: WebGpuPersistentSlotCapableRenderer | null;

        try {
          renderer = this.rendererRegistry.resolve(drawables[i]!) as unknown as WebGpuPersistentSlotCapableRenderer | null;
        } catch {
          return null;
        }

        if (renderer?._supportsPersistentSlots !== true) {
          return null;
        }

        if (owner === null) {
          owner = renderer;
        } else if (owner !== renderer) {
          return null;
        }
      }
    }

    if (owner === null) {
      return null;
    }

    // Prepack BEFORE allocating anything: a source holding an item that cannot
    // describe itself as a quad is not servable, and finding that out after the
    // store exists would mean tearing it down again.
    if (!source.prepack()) {
      return null;
    }

    const store = owner._acquirePersistentSlotStore(source, this);

    if (store !== null) {
      store.owner = owner;
      this._persistentStores.add(store);
    }

    return store;
  }

  /** @internal */
  public _writePersistentSlots(bundle: PersistentSlotBundle, source: RenderRootSource, entered: Int32Array, count: number): void {
    const store = bundle as WebGpuPersistentSlotStore;

    store.owner?._writePersistentSlotRows(store, source, entered, count);
  }

  /** @internal */
  public _drawPersistentOrder(bundle: PersistentSlotBundle, order: Uint32Array, count: number): void {
    const store = bundle as WebGpuPersistentSlotStore;

    store.owner?._drawPersistentSlots(store, order, count, this);
  }

  /** @internal */
  public _prepareDrawCommand(command: DrawCommand): void {
    // Transform packing now happens at the render-group upload boundary
    // (`_prepareRenderGroupUpload`); this hook only tracks the active draw so
    // renderers can read the current command's nodeIndex.
    this._activeDrawCommand = command;
  }

  /** @internal */
  public _endDrawPlan(): void {
    this._activeDrawCommand = null;

    const planBase = this._planBaseStack.pop() ?? 0;
    const planHash = this._planHashStack.pop() ?? 0;

    if (this._drawPlanDepth > 0) {
      this._drawPlanDepth--;
    }

    // A nested plan (filter / cacheAsTexture) just ended: flush its draws, then
    // free its transform rows so the frame-scoped buffer only grows with
    // top-level render() calls. Top-level plans (depth back to 0) keep their rows
    // so cross-call batching survives to the frame-end flush.
    if (this._drawPlanDepth > 0) {
      this._flushActiveRendererAndEndPass();
      this._getTransformStorage().buffer.rewindTo(planBase, planHash);
    }

    // Only assert balance at the outermost plan: a nested render() (e.g.
    // cacheAsTexture drawing its cache sprite) sees the still-open outer clips,
    // which are not leaks.
    if (this._drawPlanDepth === 0 && this._passCoordinatorInstance !== null) {
      const unbalanced = this._passCoordinatorInstance.unbalancedStencilClips();

      if (unbalanced > 0) {
        this._passCoordinatorInstance.resetStencil();
        throw new Error(`Unbalanced stencil clip stack at end of frame (${unbalanced} unpopped clip(s)).`);
      }
    }
  }

  public draw(drawable: Drawable): this {
    if (this._deviceLost || this._device === null) {
      this._activeDrawCommand = null;
      return this;
    }

    // Only consulted while a multi-attachment target is bound, so an ordinary
    // frame pays one boolean read per drawable.
    if (this._multiAttachmentTarget) {
      assertDrawsAllAttachments(drawable, (this._renderTarget as MultiRenderTarget).attachments.length, RenderBackendType.WebGpu);
    }

    const renderer = this.rendererRegistry.resolve(drawable);

    // Defensive: a draw the recorder cannot capture inside an active
    // window poisons it - the predicate excludes these at collect time, but
    // an incomplete replay stream must never be committable.
    if (this._retainedCaptureFrames.length > 0 && (renderer as { _supportsRetainedBatches?: boolean })._supportsRetainedBatches !== true) {
      this._poisonActiveRetainedCaptures();
    }

    this._setActiveRenderer(renderer);
    renderer.render(drawable);
    this._activeDrawCommand = null;
    this._stats.submittedNodes++;

    return this;
  }

  public drawInstanced(mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number, instances: InstanceDataView | null = null): this {
    if (count <= 0 || mesh.vertexCount === 0 || this._deviceLost || this._device === null) {
      this._activeDrawCommand = null;
      return this;
    }

    const renderer = this.rendererRegistry.resolve(mesh);

    if (!(renderer instanceof WebGpuMeshRenderer)) {
      throw new Error('drawInstanced requires a mesh handled by the WebGPU mesh renderer.');
    }

    if (this._retainedCaptureFrames.length > 0) {
      this._poisonActiveRetainedCaptures();
    }

    this._setActiveRenderer(renderer);

    // Write each instance's (transform, tint) into a fresh, contiguous transform
    // slot before the renderer's draw uploads the storage buffer, then draw the
    // geometry once over [startNodeIndex, startNodeIndex + count).
    // Contract: transforms/tints are parallel arrays of length >= count
    // (count > 0 is guaranteed by the early return above).
    const storage = this._getTransformStorage();
    const startNodeIndex = storage.pushValues(transforms[0]!, tints[0]!);

    for (let i = 1; i < count; i++) {
      storage.pushValues(transforms[i]!, tints[i]!);
    }

    renderer.drawInstancedBatch(mesh, startNodeIndex, count, instances);
    this._activeDrawCommand = null;
    this._stats.submittedNodes += count;

    return this;
  }

  public execute(pass: BackendRenderPass): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    if (this._retainedCaptureFrames.length > 0) {
      this._poisonActiveRetainedCaptures();
    }

    this._flushActiveRendererAndEndPass();
    this._stats.renderPasses++;
    pass.execute(this);

    return this;
  }

  public setBlendMode(_blendMode: BlendModes | null): this {
    // Blend mode is baked into WebGPU render pipelines at creation time.
    // This method is a no-op; renderers use the blend mode directly when
    // selecting or creating their pipelines.
    return this;
  }

  public setRenderTarget(target: RenderTarget | null): this {
    const nextRenderTarget = target ?? this._rootRenderTarget;

    assertLiveRenderTarget(nextRenderTarget);

    if (this._renderTarget !== nextRenderTarget) {
      this._flushActiveRendererAndEndPass();

      if (this._renderTarget !== this._rootRenderTarget) {
        this._unsubscribeRenderTarget(this._renderTarget);
      }

      this._renderTarget = nextRenderTarget;
      this._multiAttachmentTarget = isMultiAttachmentTarget(nextRenderTarget);
      this._stats.renderTargetChanges++;

      if (this._multiAttachmentTarget && (nextRenderTarget as MultiRenderTarget).attachments.length > this.maxColorAttachments) {
        throw new RenderError({
          code: 'unsupported-format',
          backendType: RenderBackendType.WebGpu,
          message:
            `This device accepts ${this.maxColorAttachments} colour attachment(s), but the target declares ` +
            `${(nextRenderTarget as MultiRenderTarget).attachments.length}. Check backend.maxColorAttachments.`,
        });
      }

      if (nextRenderTarget !== this._rootRenderTarget) {
        this._subscribeRenderTarget(nextRenderTarget);
      }
    }

    return this;
  }

  public pushScissorRect(bounds: Rectangle): this {
    this._flushActiveRendererAndEndPass();

    const depth = this._clipDepth;
    const slot = (this._clipPixelStack[depth] ??= { x: 0, y: 0, width: 0, height: 0 });
    const scratch = this._toClipPixels(bounds, this._clipPixelScratch);

    if (depth > 0) {
      // In range: depth > 0 means a resolved clip is already on the stack.
      this._intersectClips(this._clipPixelStack[depth - 1]!, scratch, slot);
    } else {
      slot.x = scratch.x;
      slot.y = scratch.y;
      slot.width = scratch.width;
      slot.height = scratch.height;
    }

    this._clipDepth = depth + 1;

    return this;
  }

  public composeWithAlphaMask(
    content: Texture | RenderTexture,
    mask: Texture | RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: BlendModes,
  ): this {
    if (this._multiAttachmentTarget) {
      assertSingleAttachmentCompose('Alpha-mask compositing', (this._renderTarget as MultiRenderTarget).attachments.length, RenderBackendType.WebGpu);
    }

    if (width <= 0 || height <= 0) {
      return this;
    }

    if (this._deviceLost || this._device === null) {
      return this;
    }

    if (this._retainedCaptureFrames.length > 0) {
      this._poisonActiveRetainedCaptures();
    }

    this._flushActiveRendererAndEndPass();
    this._setActiveRenderer(null);

    if (!this._maskCompositorConnected) {
      this._maskCompositor.connect(this.device);
      this._maskCompositorConnected = true;
    }

    this._maskCompositor.compose(this, content, mask, x, y, width, height, blendMode);

    return this;
  }

  public composeWithBackdropBlend(source: RenderTexture, x: number, y: number, width: number, height: number, mode: BlendModes): this {
    if (this._multiAttachmentTarget) {
      assertSingleAttachmentCompose('Backdrop-blend compositing', (this._renderTarget as MultiRenderTarget).attachments.length, RenderBackendType.WebGpu);
    }

    if (width <= 0 || height <= 0) {
      return this;
    }

    if (this._deviceLost || this._device === null) {
      return this;
    }

    if (this._retainedCaptureFrames.length > 0) {
      this._poisonActiveRetainedCaptures();
    }

    this._flushActiveRendererAndEndPass();
    this._setActiveRenderer(null);

    if (!this._backdropBlendCompositorConnected) {
      this._backdropBlendCompositor.connect(this.device);
      this._backdropBlendCompositorConnected = true;
    }

    this._backdropBlendCompositor.compose(this, source, x, y, width, height, mode);

    return this;
  }

  /**
   * Return the GPU texture backing `target`. For the root canvas target this is
   * `context.getCurrentTexture()` (requires `COPY_SRC` usage configured on the
   * canvas context). For a {@link RenderTexture} target it is the managed GPU
   * texture. Used internally by {@link WebGpuBackdropBlendCompositor} for
   * `copyTextureToTexture` backdrop capture.
   * @internal
   */
  public _renderTargetTexture(target: RenderTarget): GPUTexture {
    if (target === this._rootRenderTarget) {
      return this.context.getCurrentTexture();
    }

    if (target instanceof RenderTexture) {
      return this._getTextureState(target).texture;
    }

    throw new Error('WebGpuBackend._renderTargetTexture: unsupported render target type.');
  }

  public popScissorRect(): this {
    if (this._clipDepth === 0) {
      return this;
    }

    this._flushActiveRendererAndEndPass();

    this._clipDepth--;

    return this;
  }

  public pushStencilClip(shape: Geometry, transform: Matrix): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    // Geometric stencil clipping is owned by the pass coordinator: it shares a
    // per-target depth/stencil attachment across the clip scope's passes and
    // draws the shape silhouette into the stencil aspect. Content renderers
    // select stencil-enabled pipeline variants while the clip is in effect.
    this._flushActiveRendererAndEndPass();
    this._setActiveRenderer(null);
    this._passCoordinator.pushStencilClip(shape, transform);

    return this;
  }

  public popStencilClip(): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    this._flushActiveRendererAndEndPass();
    this._setActiveRenderer(null);
    this._passCoordinator.popStencilClip();

    return this;
  }

  public getScissorRect(): PixelClipBoundsState | null {
    if (this._clipDepth === 0) {
      return null;
    }

    // Non-empty checked above, so the top-of-stack element exists.
    const clip = this._clipPixelStack[this._clipDepth - 1]!;
    const scaleX = this._renderTarget.root && this._renderTarget.width > 0 ? this._canvas.width / this._renderTarget.width : 1;
    const scaleY = this._renderTarget.root && this._renderTarget.height > 0 ? this._canvas.height / this._renderTarget.height : 1;

    return {
      x: Math.floor(clip.x * scaleX),
      y: Math.floor(clip.y * scaleY),
      width: Math.max(0, Math.round(clip.width * scaleX)),
      height: Math.max(0, Math.round(clip.height * scaleY)),
    };
  }

  public supportsColorFormat(_format: ColorTextureFormat): boolean {
    // rgba8, rgba16float and rgba32float are all core color-renderable in WebGPU.
    // (Linear filtering / blending of float32 targets needs the optional
    // float32-filterable / float32-blendable features, requested at init when
    // available; float RenderTextures default to nearest, unblended feedback.)
    return true;
  }

  public acquireRenderTexture(width: number, height: number): RenderTexture {
    return this._renderTexturePool.acquire(width, height);
  }

  public releaseRenderTexture(texture: RenderTexture): this {
    this._renderTexturePool.release(texture);

    return this;
  }

  public trimRenderTexturePool(): this {
    this._renderTexturePool.destroy();

    return this;
  }

  public setView(view: View | null): this {
    // Only flush the open batch when the view actually changes. The unconditional
    // flush forced one draw call per render() call (each render() re-applies the
    // same camera view), defeating cross-call batching.
    if (this._renderTarget.view !== view) {
      this._flushActiveRendererAndEndPass();
    }
    this._renderTarget.setView(view);

    return this;
  }

  public clear(color?: Color): this {
    if (color) {
      this.setClearColor(color);
    }

    // With a pass kept open across batch flushes, a mid-frame clear must end
    // (submit) that open pass NOW. Otherwise the next `acquirePass` early-returns
    // the still-open pass without consuming the clear, so the clear silently
    // defers to a later pass open - surviving this frame, then detonating at the
    // next open (wiping content drawn after this point, or leaking into the next
    // frame). Ending here means the next fresh pass resolves loadOp='clear' at
    // exactly this request point: the clear wipes prior content and nothing else.
    // The open pass is always the currently bound target, so this is precisely
    // the target the clear applies to.
    if (this._passCoordinatorInstance?.hasActivePass === true) {
      this._flushActiveRendererAndEndPass();
    }

    this._clearRequested = true;

    return this;
  }

  public resize(width: number, height: number): this {
    this._rootRenderTarget.resize(width, height);
    this._hasPresentedFrame = false;

    return this;
  }

  public flush(): this {
    if (!this._device || !this._context) {
      return this;
    }

    if (this._renderer) {
      this._flushActiveRendererAndEndPass();
    } else if (this._clearRequested) {
      // No active renderer but a clear is pending: open an empty coordinator
      // pass so createColorAttachment consumes the clear state once.
      this._passCoordinator.acquirePass();
      this._passCoordinator.endPass();
    }

    if (this._gpuTimer !== null) {
      // After the passes above have been submitted, so the resolve this queues
      // lands behind every pass it reads timestamps from.
      this._gpuTimer.endFrame();
      this._stats.gpuFrameTimeMs = this._gpuTimer.lastFrameMs;
    }

    return this;
  }

  public destroy(): void {
    // Captured before the teardown below nulls `_device`: the explicit
    // `GPUDevice.destroy()` at the very end of this method is what actually
    // hands the driver-side device (on D3D12: its command queue) back.
    // Dropping the last JS reference only makes it eligible for garbage
    // collection, and a driver has a hard ceiling on live devices that GC
    // timing must not be trusted to stay under.
    const device = this._device;

    this._destroyed = true;
    this._gpuTimingRequested = false;
    this._gpuTimer?.destroy();
    this._setGpuTimer(null);
    this._removeUncapturedErrorListener();
    this.onDeviceLost.destroy();
    this.onDeviceRestored.destroy();
    this.onRenderError.destroy();
    this._setActiveRenderer(null);
    // A renderer switch no longer ends the pass, so `_setActiveRenderer(null)`
    // can leave one open here. Drop it rather than submit it: the teardown below
    // destroys the very buffers those draws bind, and the frame's pixels have
    // nowhere left to go.
    this._passCoordinatorInstance?.discardPass();
    this.rendererRegistry.destroy();
    this._destroyManagedTextures();
    this._samplers.clear();
    this._renderTexturePool.destroy();

    this._clipPixelStack.length = 0;
    this._clipDepth = 0;
    this._clipPointA.destroy();
    this._clipPointB.destroy();

    if (this._maskCompositorConnected) {
      this._maskCompositor.disconnect();
      this._maskCompositorConnected = false;
    }

    if (this._backdropBlendCompositorConnected) {
      this._backdropBlendCompositor.disconnect();
      this._backdropBlendCompositorConnected = false;
    }

    this._transformStorage?.destroy();
    this._transformStorage = null;
    this._activeDrawCommand = null;

    // Release retained group GPU resources; the plan-side sets keep their
    // (now generation-stale) bundle references and re-record elsewhere.
    for (const bundle of [...this._retainedBundles]) {
      bundle.invalidateDeviceState(this._device !== null && !this._deviceLost);
    }

    this._retainedBundles.clear();

    // Same argument for the persistent slot stores: their buffers belong to the
    // device being torn down, and the generation bump is what tells the plan to
    // treat every visible item as entering again.
    for (const store of [...this._persistentStores]) {
      store.destroy();
    }

    this._persistentStores.clear();
    this._retainedCaptureFrames.length = 0;
    this._passCoordinatorInstance?.destroyStencil();
    this._drawPlanDepth = 0;

    for (const target of [...this._renderTargetDestroyHandlers.keys()]) {
      this._unsubscribeRenderTarget(target);
    }
    this._context?.unconfigure();
    this._context = null;
    this._device = null;
    this._compressedFormats = { formats: [], gpuFormats: new Map() };
    this._format = null;
    this._initializePromise = null;
    this._clearRequested = false;
    this._hasPresentedFrame = false;
    this._deviceLost = false;
    this._texture = null;
    this._mipmapShaderModule = null;
    this._mipmapBindGroupLayout = null;
    this._mipmapPipelineLayout = null;
    this._mipmapPipeline = null;
    this._mipmapSampler = null;
    this._renderTarget = this._rootRenderTarget;
    this._clearColor.destroy();
    this._rootRenderTarget.destroy();

    // Last, so every buffer/texture destroy above still ran against a live
    // device. The resulting device loss carries reason `'destroyed'`, and
    // `_destroyed` was set at the top of this method - both the loss
    // subscription and `_handleDeviceLoss` bail out on it, so this cannot
    // start a recovery attempt. Guarded for the mock devices the jsdom suites
    // hand the backend, which implement no `destroy`.
    if (typeof device?.destroy === 'function') {
      device.destroy();
    }
  }

  /**
   * **The returned record is reused**, including its nested `clearValue`. The
   * one caller (`WebGpuPassCoordinator.acquirePass`) hands it straight to
   * `beginRenderPass`, which reads the descriptor synchronously - so nothing
   * ever needs it to survive the call. An effect-heavy frame opens hundreds of
   * passes (501 on `filter/color 100`), and two fresh records per pass was one
   * of the larger remaining per-pass costs.
   */
  /**
   * Resolve the pass attachment for colour slot `index` of the bound target.
   *
   * The load op is resolved once, on slot 0: it answers whether this target has
   * already been drawn into this frame, which is a property of the target, and the
   * attachments of one multi-attachment target are always written together.
   * Resolving per slot would consume the pending clear request on the first slot
   * and leave the rest loading undefined contents.
   */
  public createColorAttachment(index = 0): GPURenderPassColorAttachment {
    const renderTarget = this._renderTarget;
    const multi = renderTarget instanceof MultiRenderTarget ? renderTarget : null;
    let view: GPUTextureView;

    if (multi !== null) {
      view = this._syncTexture(multi.attachment(index)).view;
    } else if (renderTarget === this._rootRenderTarget) {
      view = this.context.getCurrentTexture().createView();
    } else if (renderTarget instanceof RenderTexture) {
      // Sync first so a resized RenderTexture resets its content flag before the
      // coordinator resolves the load op below.
      view = this._syncTexture(renderTarget).view;
    } else {
      throw new Error('WebGPU currently supports only root targets, RenderTexture and MultiRenderTarget targets.');
    }

    if (index === 0) {
      this._loadOpForPass = this._passCoordinator.resolveLoad(renderTarget, this._clearRequested);
      this._clearRequested = false;

      const clearValue = this._clearValue;

      clearValue.r = this._clearColor.r / 255;
      clearValue.g = this._clearColor.g / 255;
      clearValue.b = this._clearColor.b / 255;
      clearValue.a = this._clearColor.a;
    }

    const attachment = index === 0 ? this._colorAttachment : this._extraAttachment(index);

    attachment.view = view;
    attachment.loadOp = this._loadOpForPass;

    return attachment;
  }

  /** Pooled attachment record for colour slot `index`, grown on demand. */
  private _extraAttachment(index: number): GPURenderPassColorAttachment {
    const slot = index - 1;
    const existing = this._extraColorAttachments[slot];

    if (existing !== undefined) {
      return existing;
    }

    const attachment: GPURenderPassColorAttachment = {
      view: undefined as unknown as GPUTextureView,
      clearValue: this._clearValue,
      loadOp: 'load',
      storeOp: 'store',
    };

    this._extraColorAttachments[slot] = attachment;

    return attachment;
  }

  public submit(commandBuffer: GPUCommandBuffer): void {
    // Reused one-slot batch: `submit` copies the list synchronously, and an
    // effect frame submits hundreds of times.
    this._submitBatch[0] = commandBuffer;
    this.device.queue.submit(this._submitBatch);

    if (this._renderTarget === this._rootRenderTarget) {
      this._hasPresentedFrame = true;
    } else if (this._renderTarget instanceof RenderTexture) {
      const state = this._syncTexture(this._renderTarget);

      state.hasContent = true;

      if (state.mipLevelCount > 1) {
        this._generateMipmaps(state.texture, state.mipLevelCount);
      }
    }
  }

  /**
   * Whether `target` already holds rendered content this frame. The canonical
   * source of the `hasPresentedFrame` (root) / per-texture `hasContent`
   * (RenderTexture) flags that drive the coordinator's clear-vs-load decision.
   * @internal
   */
  public _targetHasContent(target: RenderTarget): boolean {
    if (target === this._rootRenderTarget) {
      return this._hasPresentedFrame;
    }

    if (target instanceof RenderTexture) {
      return this._getTextureState(target).hasContent;
    }

    return false;
  }

  /**
   * Physical pixel size of `target`'s colour attachment. The root target's colour
   * attachment is `context.getCurrentTexture()`, sized to the canvas backing
   * store (logical × pixelRatio), so a geometric stencil attachment for the root
   * must match these dimensions. RenderTexture targets back their colour and
   * stencil attachments with the same (logical) size.
   *
   * **The returned record is reused.** Read it (or destructure it) before the
   * next call; it is never safe to keep. The reason is the call frequency:
   * `_snapViewport` reaches it once per flush and once per replayed retained
   * batch, so a fresh two-field literal per call was the single largest
   * per-draw allocation in the WebGPU backend - 106 KB/frame on a 1000-flush
   * frame, against a whole-frame total of 127 KB.
   * @internal
   */
  public _getAttachmentPixelSize(target: RenderTarget): { readonly width: number; readonly height: number } {
    const size = this._attachmentPixelSize;

    if (target === this._rootRenderTarget) {
      size.width = this._canvas.width;
      size.height = this._canvas.height;

      return size;
    }

    size.width = target.width;
    size.height = target.height;

    return size;
  }

  public getTextureBinding(
    texture: Texture | RenderTexture,
    samplerOverride: SamplerOptions | null = null,
  ): {
    readonly view: GPUTextureView;
    readonly sampler: GPUSampler;
  } {
    const state = this._syncTexture(texture);

    if (samplerOverride !== null) {
      // Material overrides are a custom-material path and rare enough that a
      // fresh record costs nothing measurable; giving them the state's own
      // record would mean the default path and an override path could not be
      // resolved in the same batch.
      return { view: state.view, sampler: this._getSampler(samplerOverride.scaleMode, samplerOverride.wrapMode, this._isNonFilterable(texture)) };
    }

    // Refreshed in place: `_syncTexture` may have replaced the GPU texture (and
    // therefore the view/sampler) on this very call.
    const binding = state.binding;

    binding.view = state.view;
    binding.sampler = state.sampler;

    return binding;
  }

  /**
   * The device sampler for `texture`'s current filter and wrap state.
   *
   * Unlike {@link getTextureBinding} this resolves sampling state only: it
   * never synchronizes or uploads texture content, which makes it the correct
   * source of a sampler for a draw that binds the pixels some other way (an
   * imported external texture, for instance). The result is interned per
   * sampling state and safe to hold across frames as long as the device lives.
   */
  public getTextureSampler(texture: Texture | RenderTexture): GPUSampler {
    return this._getSampler(texture.scaleMode, texture.wrapMode, this._isNonFilterable(texture));
  }

  /**
   * The `GPUTextureFormat` a given `Texture`/`RenderTexture` is (or will be)
   * backed by. Unlike {@link renderTargetFormat} (which reflects whatever
   * target is *currently bound*), this is keyed off the texture itself, so
   * callers that build a pipeline for a specific offscreen target - before
   * that target is bound as the active render target - can match its format
   * exactly instead of reading unrelated, possibly-stale backend state.
   */
  public getTextureFormat(texture: Texture | RenderTexture): GPUTextureFormat {
    return this._getGpuTextureFormat(texture);
  }

  public shouldPremultiplyTextureSample(texture: Texture | RenderTexture): boolean {
    return !(texture instanceof RenderTexture) && texture.premultiplyAlpha;
  }

  /** Part of the renderer SDK contract for extension renderers. */
  public getTransformStorageBuffer(minCount: number): { readonly buffer: GPUBuffer; readonly tintBuffer: GPUBuffer; readonly count: number } {
    return this._getTransformStorage().getBuffer(this.device, minCount, this._accountant);
  }

  /**
   * Append a drawable's world transform (+ tint) to the shared transform storage
   * and return the slot it was written to. Used by instanced renderers for draws
   * that arrive without a render-group upload boundary - i.e. a direct
   * `backend.draw(drawable)` outside the plan player (`activeDrawCommand === null`),
   * where no stable `nodeIndex` was assigned. Each call allocates a fresh slot, so
   * a batch of synthetic draws does not collide on a single row.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public _pushTransform(drawable: Drawable): number {
    // Raw world transform + snap-mode flag; the vertex stage snaps the origin.
    return this._getTransformStorage().push(drawable, undefined, drawable.pixelSnapMode);
  }

  /**
   * Device-pixel viewport rect of the active render pass - the region the pass
   * coordinator applies via `setViewport`, or the full colour attachment when
   * the view uses the default `0..1` viewport. The core vertex stages read this
   * (staged into their `viewport` uniform) to project a drawable's clip-space
   * origin into device pixels for GPU-side position snapping. Mirrors
   * {@link WebGpuPassCoordinator._applyViewport}; because the rect is whole
   * device pixels, grid alignment is independent of WebGPU's y-up clip
   * convention. The returned object is a reused scratch - read it immediately.
   * @internal
   */
  public get _snapViewport(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    const { width, height } = this._getAttachmentPixelSize(this._renderTarget);
    const vp = this.view.viewport;
    const rect = this._snapViewportRect;

    if (vp.x === 0 && vp.y === 0 && vp.width === 1 && vp.height === 1) {
      rect.x = 0;
      rect.y = 0;
      rect.width = width;
      rect.height = height;

      return rect;
    }

    // WebGPU's framebuffer origin is top-left (y-down), so `viewport.y` maps
    // directly - no flip (unlike WebGL2's bottom-left `gl.viewport`).
    rect.x = Math.floor(vp.x * width);
    rect.y = Math.floor(vp.y * height);
    rect.width = Math.max(1, Math.round(vp.width * width));
    rect.height = Math.max(1, Math.round(vp.height * height));

    return rect;
  }

  /**
   * Hand the draw stream to `renderer`, draining the outgoing one first. The
   * GPU pass is NOT ended: a renderer switch is a batching boundary, not a
   * submit boundary, so a mixed sprite/mesh scene records both renderers' draws
   * into one pass instead of paying a pass plus a `queue.submit` per
   * alternation. What the pass end used to buy - every renderer's hazard guards
   * only ever seeing its own draws - is replaced by
   * `WebGpuPassCoordinator.passHasDraws`, which the guards against SHARED
   * resources (transform storage growth, managed texture re-upload) consult
   * instead of their own cursors.
   */
  private _setActiveRenderer(renderer: Renderer | null): void {
    if (this._renderer !== renderer) {
      this._renderer?.flush();
      this._renderer = renderer;
    }
  }

  private _flushActiveRendererAndEndPass(): void {
    this._renderer?.flush();
    // Ending the active GPU pass - and thus `queue.submit` - is centralized here
    // so it happens only at genuine boundaries (render-target / view / scissor /
    // stencil change, compositor, execute, plan / frame end), NOT once per batch
    // flush and not on a renderer switch. Instanced renderers record consecutive
    // batch flushes into the same open pass (via WebGpuPassArena) and no
    // longer end it themselves, collapsing thousands of per-draw submits into
    // one per frame.
    this._passCoordinatorInstance?.endPass();
  }

  /**
   * Active per-group transform for the draws submitted until the next call.
   * `null` means identity (no retained group).
   * Renderers fold it into their vertex stage as the projection UBO's `group`.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public get renderGroupTransform(): Matrix | null {
    return this._renderGroupTransform;
  }

  /**
   * Monotonic stamp bumped on every {@link _setRenderGroupTransform} call.
   * Renderers compare it to skip redundant group re-staging within an
   * unchanged group scope.
   * @internal
   */
  public get renderGroupTransformId(): number {
    return this._renderGroupTransformId;
  }

  /**
   * Playback hook (RenderPlanPlayer): enter/leave a retained transform group.
   * A group is a flush boundary by design - the pending batch must
   * drain under the OLD group matrix before the new one takes effect. The GPU
   * pass deliberately stays OPEN across the boundary: renderers
   * that share a per-flush projection UBO guard it themselves against content
   * changes within an open pass (`_endPassOnProjectionChange`, so uncached
   * playback splits lazily at the next conflicting flush instead of eagerly
   * here), and replayed retained batches bind group-owned UBOs that never
   * alias the shared one - N cached groups cost zero extra submits.
   * @internal
   */
  public _setRenderGroupTransform(transform: Matrix | null): void {
    this._renderer?.flush();
    this._renderGroupTransform = transform;
    this._renderGroupTransformId++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Retained instruction-set record/replay.
  // ───────────────────────────────────────────────────────────────────────────

  /** Whether at least one retained capture window is active. Part of the renderer SDK contract for extension renderers. */
  public get _retainedCaptureActive(): boolean {
    return this._retainedCaptureFrames.length > 0;
  }

  /**
   * The innermost active capture window, or `null` when none is open.
   * A fresh `WebGpuRetainedCaptureFrame` instance is created per capture-open
   * call (even across re-records of the same bundle) and discarded at
   * `_endRetainedCapture`, so its identity is a precise "this specific
   * open/close cycle" token - lets a renderer that can record at most once per
   * capture (e.g. Text, whose per-batch replay state isn't keyed for more)
   * detect a second record attempt within the SAME window via a `WeakSet`,
   * without needing bundle-level bookkeeping of its own.
   * @internal
   */
  public get _currentRetainedCaptureFrame(): WebGpuRetainedCaptureFrame | null {
    const frames = this._retainedCaptureFrames;

    return frames.length > 0 ? frames[frames.length - 1]! : null;
  }

  /**
   * Playback hook: a retained group scope starts recording (contract in
   * RenderPlanPlayer). The pending batch is flushed first so no batch spans
   * into the capture window; the set's grow-only bundle is created (or reused
   * across recaptures) and a capture frame joins the stack.
   * @internal
   */
  public _beginRetainedCapture(set: RetainedInstructionSet): void {
    this._renderer?.flush();

    let bundle = set.ownedBundle instanceof WebGpuRetainedGroupBundle ? set.ownedBundle : null;

    if (bundle === null) {
      // A bundle from another backend (backend switch): release it before
      // claiming ownership, so the old backend's GPU memory is not leaked.
      set.ownedBundle?.destroy?.();

      bundle = new WebGpuRetainedGroupBundle(this._accountant, released => this._retainedBundles.delete(released));
      this._retainedBundles.add(bundle);
      set.ownedBundle = bundle;
    }

    this._retainedCaptureFrames.push(new WebGpuRetainedCaptureFrame(set, bundle));
  }

  /**
   * Playback hook: the recording scope's playback ended. Flushes the pending
   * batch INTO the still-active captures (the group's trailing draws belong
   * to the set), pops the frame, and finalizes the bundle: node indices in
   * the staged bytes are rebased group-local, instance bytes and the group's
   * transform rows are uploaded into the group-owned buffers, and every
   * staged instruction is stamped with the final resource generation.
   * @internal
   */
  public _endRetainedCapture(set: RetainedInstructionSet): void {
    this._renderer?.flush();

    const frames = this._retainedCaptureFrames;
    let index = frames.length - 1;

    while (index >= 0 && frames[index]!.set !== set) {
      index--;
    }

    if (index === -1) {
      return;
    }

    // Non-empty by construction: index was found above.
    const frame = frames[index]!;

    frames.splice(index, 1);
    this._finalizeRetainedCapture(frame);
  }

  /**
   * Playback hook: replay one recorded batch from group-owned resources into
   * the OPEN pass (no end/submit at group boundaries on the cached path).
   * All state - pipeline, projection/group uniforms, texture bindings
   * - is resolved live; only the recorded data is reused. Dispatches to the
   * renderer that recorded the batch (any {@link WebGpuRetainedBatchReplayer},
   * not just the sprite renderer).
   * @internal
   */
  public _replayRetainedBatch(batch: RetainedBatchInstruction): void {
    // Drain the pending LIVE batch first (WebGL2 parity). The player's ordering
    // guarantee - a group-transform switch, and therefore a flush, immediately
    // before the first replay of a spliced scope - only holds for scopes entered
    // through a transform-group boundary. The automatic render-root
    // representation splices a scope with no boundary of its own, and
    // `_setActiveRenderer` below flushes only on a renderer CHANGE, so a pending
    // sprite batch would otherwise be issued AFTER the replayed batches it was
    // recorded in front of. Flushing an empty batcher is a cheap early return,
    // so the repeat cost across a run of replays is nil.
    this._renderer?.flush();

    if (this._deviceLost || this._device === null) {
      return;
    }

    const payload = batch.payload as WebGpuRetainedBatchPayload | null;

    if (payload === null || typeof payload !== 'object' || !(payload.bundle instanceof WebGpuRetainedGroupBundle)) {
      return;
    }

    // Parity with the live path: draw() counts submitted nodes before any
    // flush-time visibility decision (mask/scissor) can drop the batch - and it
    // counts NODES, so a batch whose renderer expands one node into many
    // instances contributes its recorded node count (see
    // RetainedBatchInstruction), not its instance count.
    this._stats.submittedNodes += batch.nodeCount ?? batch.instanceCount;
    this._setActiveRenderer(payload.renderer);
    payload.renderer._replayRetainedBatch(payload);
  }

  /**
   * Collect-time backend validation on top of the plan-level
   * generation check: every recorded batch's managed texture views must still
   * be the recorded identities - `_syncTexture` recreates the view on resize,
   * and resized textures invalidate the UV words baked into the cached
   * instance bytes. A failed check also DROPS the recording (the plan-level
   * key would otherwise stay "valid" and block the player from re-recording),
   * so the group re-records on this same clean frame and returns to the fast
   * tier. Poisoned sets stay vetoed without re-record (entry replay forever -
   * correct, and re-recording would just re-poison).
   * @internal
   */
  public _validateRetainedInstructionSet(set: RetainedInstructionSet): boolean {
    if (this._rejectedRetainedSets.has(set)) {
      return false;
    }

    if (this._deviceLost || this._device === null) {
      return false;
    }

    for (const instruction of set.instructions) {
      if (instruction.kind !== RetainedInstructionKind.Batch) {
        continue;
      }

      const payload = instruction.payload as WebGpuRetainedBatchPayload | null;

      if (payload === null || typeof payload !== 'object' || !(payload.bundle instanceof WebGpuRetainedGroupBundle)) {
        return false;
      }

      if (!payload.bundle.isReady) {
        set.invalidate();

        return false;
      }

      if (payload.renderer._validateRetainedBatch?.(payload) === false) {
        set.invalidate();

        return false;
      }

      const textures = payload.textures;

      for (let i = 0; i < textures.length; i++) {
        // In-bounds: i < textures.length; recordedViews is parallel.
        const texture = textures[i]!;
        const state = this._textureStates.get(texture);

        // The dimension check catches a resize that has not SYNCED yet (the
        // managed view only refreshes at the next binding resolve, which
        // happens after this collect-time validation): recorded UV words are
        // normalized against the record-time texture size, so any size change
        // - pending or materialized - must force a recapture.
        // The orientation check is the same argument one axis further: the
        // recorded UV words carry the flipY swap baked in, so a texture that
        // flips afterwards replays upside down while view and size still match.
        if (
          state === undefined ||
          state.view !== payload.recordedViews[i] ||
          state.width !== texture.width ||
          state.height !== texture.height ||
          (texture instanceof Texture && texture.flipY) !== payload.recordedFlipY[i]
        ) {
          set.invalidate();

          return false;
        }
      }
    }

    return true;
  }

  /**
   * Stage one recorded renderer flush (called by any capable renderer, e.g.
   * the sprite renderer, while a capture window is active): copies the
   * packed instance bytes (owned by the INNERMOST capture's bundle),
   * resolves the recorded texture views, and appends one shared instruction
   * to every active set.
   *
   * `nodeCount` is the batch's `stats.submittedNodes` contribution and defaults
   * to `instanceCount` (one instance is one node). A renderer whose node expands
   * into several instances must pass its own count - see
   * {@link RetainedBatchInstruction.nodeCount}. It is the LAST parameter on
   * purpose: inserting it next to `instanceCount` would silently shift the
   * existing optional trailing arguments at every cross-package call site.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public _recordRetainedBatch(
    replayer: WebGpuRetainedBatchReplayer,
    instanceData: ArrayBuffer,
    byteLength: number,
    instanceCount: number,
    blendMode: BlendModes,
    textures: ReadonlyArray<Texture | RenderTexture | null>,
    slotCount: number,
    geometry: WebGpuRetainedGeometryRef | null = null,
    rendererData: unknown = null,
    nodeCount: number = instanceCount,
  ): void {
    const frames = this._retainedCaptureFrames;

    if (frames.length === 0) {
      return;
    }

    // Non-empty checked above.
    const owner = frames[frames.length - 1]!;

    if (owner.poisoned) {
      return;
    }

    const bytes = new Uint8Array(byteLength);

    bytes.set(new Uint8Array(instanceData, 0, byteLength));

    // Scan the frame-global node indices so capture end can rebase them
    // group-local and copy the row range once. Layout-aware (word offset,
    // stride) - delegated to the renderer that packed the bytes.
    const range = this._retainedBatchIndexRange;

    range.min = 0xffffffff;
    range.max = 0;
    replayer._scanRetainedNodeIndexRange(bytes, range);

    const textureList: Array<Texture | RenderTexture> = [];
    const recordedViews: GPUTextureView[] = [];
    const recordedFlipY: boolean[] = [];

    for (let i = 0; i < slotCount; i++) {
      const texture = textures[i];

      if (texture === null || texture === undefined) {
        continue;
      }

      textureList.push(texture);
      // The flush that stages this batch just resolved every slot's binding,
      // so the managed state exists and this is a pure cache read.
      recordedViews.push(this._getTextureState(texture).view);
      recordedFlipY.push(texture instanceof Texture && texture.flipY);
    }

    const payload: WebGpuRetainedBatchPayload = {
      renderer: replayer,
      bundle: owner.bundle,
      byteOffset: owner.totalBytes,
      instanceCount,
      blendMode,
      geometry,
      // This batch's ordinal within the owning bundle - the group-owned UBO
      // slot an indexed replayer writes with dynamic offset (sprite ignores it).
      batchIndexInBundle: owner.staged.length,
      textures: textureList,
      recordedViews,
      recordedFlipY,
      rendererData,
    };
    // Generation is stamped at capture end (post-growth, official plan-layer
    // seam); the sentinel keeps the set invalid if finalization never runs
    // (device loss mid-capture).
    const instruction: RetainedBatchInstruction = {
      kind: RetainedInstructionKind.Batch,
      bundle: owner.bundle,
      generation: retainedGenerationUnstamped,
      instanceCount,
      nodeCount,
      drawCalls: 1,
      payload,
    };

    owner.staged.push({ bytes, byteOffset: owner.totalBytes, minNodeIndex: range.min, maxNodeIndex: range.max, instruction });
    owner.totalBytes += byteLength;

    for (const frame of frames) {
      frame.set.append(instruction);
    }
  }

  /**
   * Mark every active capture window as unreplayable (see
   * {@link WebGpuRetainedCaptureFrame.poisoned}). A poisoned window's set is
   * vetoed in `_validateRetainedInstructionSet`, so the group stays on the
   * (correct) entry-replay tier instead of replaying an incomplete instruction
   * stream.
   *
   * Most callers are defensive and the collect-time recordability predicate
   * keeps them unreachable - a renderer whose non-recordable draws are decidable
   * PER DRAWABLE states that through `_admitsRetainedRecording` so no capture is
   * opened for them at all. Two callers do fire on healthy frames and cannot be
   * pre-empted per drawable, because both are properties of how a frame's draws
   * compose into flushes rather than of any one drawable: the Text renderer's
   * multi-batch / second-flush-per-window guard, and this backend's own
   * single-mesh default path (the recordable mesh draw needs a RUN of ≥2
   * same-geometry meshes, so a lone static-geometry mesh inside a capture
   * poisons it). Both leave the group re-recording and re-poisoning per frame on
   * the correct tier; a cheaper veto form is the open follow-up.
   * @internal
   */
  public _poisonActiveRetainedCaptures(): void {
    for (const frame of this._retainedCaptureFrames) {
      frame.poisoned = true;
    }
  }

  private _finalizeRetainedCapture(frame: WebGpuRetainedCaptureFrame): void {
    if (frame.poisoned) {
      this._rejectedRetainedSets.add(frame.set);

      return;
    }

    // A markers-only / empty capture needs no GPU resources; instruction sets
    // without batches validate trivially. Device loss mid-capture leaves the
    // staged instructions at the -1 generation sentinel → the set stays invalid.
    if (frame.staged.length === 0 || this._device === null || this._deviceLost) {
      return;
    }

    const device = this._device;
    const bundle = frame.bundle;
    const staged = frame.staged;
    let base = 0xffffffff;
    let maxNodeIndex = 0;
    // A batch whose renderer opts out of the shared transform store
    // (`_consumesSharedTransform === false`, e.g. Text - its per-instance
    // "node index" addresses its OWN private data store, not a row in the
    // shared TransformBuffer) leaves `_scanRetainedNodeIndexRange` a no-op, so
    // its `minNodeIndex`/`maxNodeIndex` stay at the unset sentinel
    // (`max < min`). Such batches must not contribute to the shared-range
    // span below - merging their sentinel into `base`/`maxNodeIndex` would
    // corrupt the span for every OTHER (shared-transform-consuming) renderer
    // recorded into the same bundle, and a capture containing ONLY such
    // batches would otherwise compute a negative `rowCount` and hand
    // `writeBuffer` a garbage out-of-range copy below.
    let hasSharedTransformRange = false;

    for (const batch of staged) {
      if (batch.maxNodeIndex < batch.minNodeIndex) {
        continue;
      }

      hasSharedTransformRange = true;

      if (batch.minNodeIndex < base) {
        base = batch.minNodeIndex;
      }

      if (batch.maxNodeIndex > maxNodeIndex) {
        maxNodeIndex = batch.maxNodeIndex;
      }
    }

    const rowCount = hasSharedTransformRange ? maxNodeIndex - base + 1 : 0;
    const transformBytes = rowCount * retainedTransformSlotBytes;
    const tintBytes = rowCount * retainedTintSlotBytes;

    // Growth is safe against the open pass: a bundle can only be re-recorded
    // on a frame whose set was invalid at collect time, so no draw recorded
    // into the open pass references the buffers replaced here.
    bundle.ensureCapacity(device, frame.totalBytes, transformBytes, tintBytes);

    for (const batch of staged) {
      // Rebase this batch's instance node indices to group-local indices -
      // the cached bytes become immune to frame-local index shifts
      // and address the group-owned row copy below. Layout-aware - delegated
      // to the renderer that packed the bytes (the payload was already
      // created at record time, so its renderer is in hand here). A
      // shared-transform opt-out renderer's rebase is a no-op (see above);
      // `base` is irrelevant to it either way.
      const payload = batch.instruction.payload as WebGpuRetainedBatchPayload;

      payload.renderer._rebaseRetainedNodeIndices(batch.bytes, base);

      device.queue.writeBuffer(bundle.instanceBuffer!, batch.byteOffset, batch.bytes.buffer, batch.bytes.byteOffset, batch.bytes.byteLength);
      stampRetainedBatchGeneration(batch.instruction);
    }

    if (hasSharedTransformRange) {
      // Copy the group's transform + tint rows [base, base + rowCount) -
      // written by this playback's Phase-1 pre-pass into the frame-scoped CPU
      // buffers - into the group-owned storage at group-local row 0. Tint
      // lives in its own buffer (see TransformBuffer's class doc), copied
      // separately from the same frame-scoped source.
      const transformStorage = this._getTransformStorage().buffer;
      const transformData = transformStorage.data;
      const tintData = transformStorage.tintData;

      device.queue.writeBuffer(bundle.transformBuffer!, 0, transformData.buffer, transformData.byteOffset + base * retainedTransformSlotBytes, transformBytes);
      device.queue.writeBuffer(bundle.tintBuffer!, 0, tintData.buffer, tintData.byteOffset + base * retainedTintSlotBytes, tintBytes);
      this._accountant.recordBufferUpload(frame.totalBytes + transformBytes + tintBytes);
    } else {
      this._accountant.recordBufferUpload(frame.totalBytes);
    }

    // Record the rebase base + row count so a later child move can
    // patch its one row in place (O(k)) instead of dropping the recording.
    bundle._recordTransformRowRange(device, hasSharedTransformRange ? base : 0, rowCount);
  }

  /**
   * Whether resolving `minCount` transform-storage slots would reallocate (and
   * free) the shared GPU storage buffer. Instanced renderers consult this before
   * appending a batch into an open pass: growing the storage destroys the buffer
   * earlier batches in that pass still reference, so the renderer ends (submits)
   * the pass first when this is true and the pass already holds batches.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public _transformStorageWouldGrow(minCount: number): boolean {
    return this._getTransformStorage().wouldGrow(minCount);
  }

  /**
   * Whether syncing `texture` would issue a *mutating* GPU op on a resource
   * earlier draws in an open pass may already reference - i.e. a re-upload (its
   * content version bumped) or a resize (destroy + recreate of the backing
   * `GPUTexture`). A first-time upload (no managed state yet, or state still at
   * the sentinel version) is NOT a mutation: no recorded draw can reference a
   * texture that did not exist when it was recorded.
   *
   * Instanced renderers consult this before binding a batch's textures into an
   * open pass: `queue.writeTexture` / `copyExternalImageToTexture` land on the
   * queue timeline BEFORE the deferred submit, so re-uploading between two
   * merged flushes would retroactively change draws already recorded into the
   * pass. When true (and the pass already holds batches) the renderer ends
   * (submits) the pass first, capturing those draws against the pre-mutation
   * content, then reopens with a fresh slice - mirroring the `wouldGrow` guard.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public _textureUploadWouldMutate(texture: Texture | RenderTexture): boolean {
    const state = this._textureStates.get(texture);

    if (state === undefined || state.version === -1) {
      return false;
    }

    const version = texture instanceof RenderTexture ? texture.textureVersion : texture.version;

    return state.version !== version;
  }

  private _getTransformStorage(): WebGpuTransformStorage {
    if (this._transformStorage === null || this._transformStorage === undefined) {
      this._transformStorage = new WebGpuTransformStorage();
    }

    return this._transformStorage;
  }

  private async _initialize(): Promise<this> {
    const gpuNavigator = this._getGpuNavigator();

    if (gpuNavigator === null) {
      throw new Error('This browser does not support WebGPU.');
    }

    if (typeof gpuNavigator.gpu.requestAdapter !== 'function') {
      throw new Error('WebGPU is available, but navigator.gpu.requestAdapter is not implemented.');
    }

    if (typeof gpuNavigator.gpu.getPreferredCanvasFormat !== 'function') {
      throw new Error('WebGPU is available, but navigator.gpu.getPreferredCanvasFormat is not implemented.');
    }

    // Request the adapter AND the device before acquiring a WebGPU canvas
    // context - see the getContext('webgpu') call below for why the order
    // matters.
    let adapter: GPUAdapter | null;

    try {
      adapter = await gpuNavigator.gpu.requestAdapter();
    } catch (error) {
      throw this._createInitializationError('Failed to request a WebGPU adapter.', error);
    }

    if (adapter === null) {
      throw new Error('Could not acquire a WebGPU adapter.');
    }

    if (typeof adapter.requestDevice !== 'function') {
      throw new Error('WebGPU adapter does not expose requestDevice().');
    }

    let device: GPUDevice | null;

    try {
      // rgba16float and rgba32float are both core color-renderable in WebGPU (no
      // feature needed). Opt into the optional float features the adapter offers
      // so float32 targets can additionally be linear-sampled / blended when used
      // that way (float RenderTextures default to nearest, so this is a bonus).
      const floatFeatures = (['float32-filterable', 'float32-blendable'] as const).filter(feature => adapter.features?.has(feature) ?? false);

      // Compressed-format families are optional features, and a device only
      // carries what the request asked for - so an adapter that supports BC
      // still yields a device that rejects a BC texture unless it is requested
      // here. Filtering against the adapter first keeps the request satisfiable:
      // asking for a family the adapter lacks fails the whole `requestDevice`.
      const compressedFeatures = webgpuCompressedTextureFeatures.filter(feature => adapter.features?.has(feature) ?? false);

      // The sprite batcher sizes its multi-texture bind-group layout from the
      // GRANTED device limits (resolveSpriteBatchTextureSlots): request up to
      // the 32-slot ceiling when the adapter offers more than the spec base of
      // 16 texture/sampler bindings per stage. Requesting min(adapterLimit,
      // ceiling) is always satisfiable, so this can never fail the request.
      const requiredLimits: Record<string, number> = {};
      const adapterLimits = (adapter as { limits?: GPUSupportedLimits }).limits;

      if (adapterLimits !== undefined) {
        for (const limit of ['maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage'] as const) {
          const available = adapterLimits[limit];

          if (typeof available === 'number' && available > baseSpriteBatchTextureSlots) {
            requiredLimits[limit] = Math.min(maxSpriteBatchTextureSlots, available);
          }
        }
      }

      // A device's feature set is fixed at creation, so `timestamp-query` has to
      // be requested here or `setGpuTimingEnabled` can never succeed on this
      // device. Requesting a feature nothing uses changes no rendering behaviour
      // and costs nothing until a timer actually allocates a query set.
      const timestampFeatures = (['timestamp-query'] as const).filter(feature => adapter.features?.has(feature) ?? false);

      const descriptor: GPUDeviceDescriptor = {};

      if (floatFeatures.length > 0 || compressedFeatures.length > 0 || timestampFeatures.length > 0) {
        descriptor.requiredFeatures = [...floatFeatures, ...compressedFeatures, ...timestampFeatures];
      }

      if (Object.keys(requiredLimits).length > 0) {
        descriptor.requiredLimits = requiredLimits;
      }

      device = await adapter.requestDevice(Object.keys(descriptor).length > 0 ? descriptor : undefined);
    } catch (error) {
      throw this._createInitializationError('Failed to request a WebGPU device.', error);
    }

    if (device === null) {
      throw new Error('Could not acquire a WebGPU device.');
    }

    // Acquire the WebGPU canvas context only after BOTH the adapter and the
    // device are secured. getContext('webgpu') is exclusive per canvas - once
    // it succeeds, the same canvas can no longer produce a WebGL2 context.
    // Acquiring it earlier would lock the canvas even when WebGPU ultimately
    // fails (a usable adapter but a failing requestDevice - e.g. a missing
    // backend library), which breaks the automatic WebGL2 fallback in
    // Application.
    // From here on the device exists but is not yet owned by `this._device`,
    // so a failure would strand it beyond the reach of `destroy()`. Every
    // throw on this stretch releases it explicitly - the driver's live-device
    // ceiling is low enough that a leak per failed initialization matters,
    // and `Application`'s WebGPU→WebGL2 fallback walks exactly this path.
    try {
      const context = getWebGpuContext(this._canvas);

      if (context === null) {
        throw new Error('Could not create WebGPU canvas context.');
      }

      const format = gpuNavigator.gpu.getPreferredCanvasFormat();

      try {
        context.configure({
          device,
          format,
          alphaMode: this._alphaMode,
          // COPY_SRC is required by WebGpuBackdropBlendCompositor to capture
          // the root-canvas backdrop via copyTextureToTexture.
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
      } catch (error) {
        throw this._createInitializationError('Failed to configure the WebGPU canvas context.', error);
      }

      this._context = context;
      this._format = format;
    } catch (error) {
      if (typeof device.destroy === 'function') {
        device.destroy();
      }

      throw error;
    }

    this._device = device;
    this._compressedFormats = readWebgpuCompressedFormats(device);

    // Surface uncaptured GPU errors (validation / OOM / internal) through
    // onRenderError. Re-installed automatically after device-loss recovery
    // because recovery re-runs _initialize. Guarded: mock devices in the Node
    // test environment do not extend EventTarget.
    if (typeof device.addEventListener === 'function') {
      device.addEventListener('uncapturederror', this._onUncapturedError);
    }

    this._hasPresentedFrame = false;
    this._subscribeToDeviceLoss();
    this.rendererRegistry.connect(this);
    this.resize(this._rootRenderTarget.width, this._rootRenderTarget.height);

    // Kick off async pipeline pre-warm for any renderer that supports
    // it. Each renderer creates its full set of (blendMode × format)
    // pipelines via createRenderPipelineAsync in parallel, so the first
    // draw call of every blend mode does not have to block on synchronous
    // pipeline creation. Renderers without a prewarmPipelines method
    // continue to create pipelines lazily on first use.
    const prewarmFormats: readonly GPUTextureFormat[] = [this.format, managedTextureFormat];

    await this._prewarmRendererPipelines(prewarmFormats);

    return this;
  }

  private _subscribeToDeviceLoss(): void {
    if (!this._device) {
      return;
    }

    const subscribedDevice = this._device;

    void subscribedDevice.lost.then(info => {
      // Recovery may have already replaced this._device with a fresh one;
      // the old promise still resolves when the previous device is gone.
      // Only react if the lost device is still the current one.
      if (this._destroyed || this._device !== subscribedDevice) {
        return;
      }

      this._handleDeviceLoss(info);
    });
  }

  private _handleDeviceLoss(info: GPUDeviceLostInfo): void {
    this._deviceLost = true;
    this.onDeviceLost.dispatch(info);

    // Reason 'destroyed' means destroy() was called explicitly (by us or by
    // user code). Don't try to recover - the loss is intentional.
    if (info.reason === 'destroyed') {
      return;
    }

    void this._attemptRecovery();
  }

  private async _attemptRecovery(): Promise<void> {
    if (this._isRecovering || this._destroyed) {
      return;
    }

    this._isRecovering = true;
    // Every attempt's failure cause is kept, not just the last one - an early
    // attempt can fail for a different reason (e.g. adapter momentarily gone)
    // than the final one (e.g. device creation rejected), and that history
    // matters for diagnosing why recovery never completed.
    const recoveryCauses: unknown[] = [];

    try {
      while (this._recoveryAttempt < this._maxRecoveryAttempts && !this._destroyed) {
        this._recoveryAttempt++;

        this._teardownDeviceState();

        try {
          await this._initialize();

          if (this._destroyed) {
            return;
          }

          this._deviceLost = false;
          this._recoveryAttempt = 0;

          if (this._gpuTimingRequested) {
            this.setGpuTimingEnabled(true);
          }

          // Re-cache the resolved init promise so a subsequent external
          // initialize() call returns the live state instead of running
          // a second initialization (which would tear the working
          // backend down).
          this._initializePromise = Promise.resolve(this);
          this.onDeviceRestored.dispatch();

          return;
        } catch (error) {
          if (this._destroyed) {
            return;
          }

          recoveryCauses.push(error);

          const delay = this._recoveryBackoffMs * Math.pow(2, this._recoveryAttempt - 1);

          await new Promise<void>(resolve => {
            setTimeout(resolve, delay);
          });
        }
      }

      if (!this._destroyed) {
        this._reportRecoveryFailure(recoveryCauses);
      }
    } finally {
      this._isRecovering = false;
    }
  }

  /**
   * All {@link _maxRecoveryAttempts} device-recovery retries failed: the
   * canvas is now permanently dead (frozen on its last presented frame)
   * until the app is reloaded. Report this loudly - the alternative is a
   * black, frozen canvas with a silent console, the hardest failure mode to
   * self-diagnose. Dispatched through {@link onRenderError} (which
   * {@link Application} already forwards to `onError`) rather than a
   * dedicated signal: this is fundamentally an error report, not a
   * transient lifecycle state like {@link onDeviceLost}/{@link onDeviceRestored}.
   */
  private _reportRecoveryFailure(causes: readonly unknown[]): void {
    this._reportRenderError(
      new RenderError({
        code: 'device-recovery-failed',
        backendType: RenderBackendType.WebGpu,
        message: `[ExoJS] WebGPU device recovery failed after ${this._maxRecoveryAttempts} attempt(s). The canvas will stay black until the app is reloaded.`,
        cause: new AggregateError(causes, 'All WebGPU device-recovery attempts failed.'),
      }),
    );
  }

  /** Keep the timer and the coordinator that feeds it timestamp slots in step. */
  private _setGpuTimer(timer: WebGpuGpuTimer | null): void {
    this._gpuTimer = timer;

    if (this._passCoordinatorInstance !== null) {
      this._passCoordinatorInstance.gpuTimer = timer;
    }
  }

  /**
   * Tear down all device-bound state in preparation for re-initialization.
   * User-facing handles (Texture, RenderTexture, RenderTarget) keep their
   * identity - their GPU-side state is rebuilt lazily on next use against
   * the new device.
   */
  private _teardownDeviceState(): void {
    // The uncapturederror listener belongs to the dead device; _initialize
    // installs a fresh one on the replacement device.
    this._removeUncapturedErrorListener();

    // The query set and its buffers belonged to the dead device. Recovery
    // re-arms a fresh timer if timing is still wanted.
    this._gpuTimer?.destroy();
    this._setGpuTimer(null);
    this._stats.gpuFrameTimeMs = null;

    // Detach destroy listeners from cached textures, then drop the cache.
    // The underlying GPUTexture objects belonged to the dead device, so we
    // do not (and cannot) call .destroy() on them - the dead device will
    // garbage-collect them. A fresh GPUTexture is created on next access.
    for (const [texture, handler] of this._textureDestroyHandlers) {
      texture.removeDestroyListener(handler);
    }

    for (const [texture, handler] of this._textureReleaseHandlers) {
      texture.removeReleaseListener(handler);
    }

    this._textureDestroyHandlers.clear();
    this._textureReleaseHandlers.clear();
    this._textureStates.clear();
    this._samplers.clear();

    // Recycled RenderTexture pool: drop entries - their backing GPUTexture
    // is gone with the dead device.
    this._renderTexturePool.forget();

    // Disconnect renderers so they release pipelines / buffers / bind
    // groups tied to the dead device. They reconnect during _initialize().
    this.rendererRegistry.disconnect();

    // Whatever those flushes recorded - and anything a renderer switch left
    // open before the loss - belongs to the dead device. The coordinator
    // survives recovery and `acquirePass` short-circuits on an open pass, so a
    // pass left set here would be handed to the RESTORED device and every later
    // frame would record into the dead encoder. Drop it, never submit it.
    this._passCoordinatorInstance?.discardPass();

    if (this._maskCompositorConnected) {
      this._maskCompositor.disconnect();
      this._maskCompositorConnected = false;
    }

    if (this._backdropBlendCompositorConnected) {
      this._backdropBlendCompositor.disconnect();
      this._backdropBlendCompositorConnected = false;
    }

    // Mipmap pipeline cache is keyed to the dead device - drop it.
    this._mipmapShaderModule = null;
    this._mipmapBindGroupLayout = null;
    this._mipmapPipelineLayout = null;
    this._mipmapPipeline = null;
    this._mipmapSampler = null;
    this._transformStorage?.destroy();
    this._transformStorage = null;
    this._activeDrawCommand = null;

    // Retained group bundles hold buffers of the dead device: drop the GPU
    // handles and bump every generation so recorded instruction sets fail
    // validation and re-record against the fresh device. Any capture
    // in flight is abandoned (its instructions keep the -1 sentinel).
    for (const bundle of this._retainedBundles) {
      bundle.invalidateDeviceState(false);
    }

    // Persistent slot stores hold buffers of the dead device. Drop the handles
    // and bump every generation, which is what makes the plan re-acquire and
    // treat the next selection as all-entering.
    for (const store of this._persistentStores) {
      store.invalidateDeviceResources();
    }

    this._persistentStores.clear();

    this._retainedCaptureFrames.length = 0;

    // Stencil GPU resources belong to the dead device; drop them so they are
    // lazily rebuilt against the fresh device on the next clip.
    this._passCoordinatorInstance?.destroyStencil();

    this._context?.unconfigure();
    this._context = null;
    this._device = null;
    this._compressedFormats = { formats: [], gpuFormats: new Map() };
    this._format = null;
    this._initializePromise = null;
    this._hasPresentedFrame = false;
  }

  private async _prewarmRendererPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const promises: Array<Promise<void>> = [];

    for (const renderer of this.rendererRegistry.renderers()) {
      const candidate = renderer as Partial<{
        prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void>;
      }>;

      if (typeof candidate.prewarmPipelines === 'function') {
        promises.push(candidate.prewarmPipelines(formats));
      }
    }

    await Promise.all(promises);
  }

  private _getGpuNavigator(): (Navigator & { gpu: GPU }) | null {
    const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU }>;

    return gpuNavigator.gpu ? gpuNavigator : null;
  }

  /**
   * `device.createShaderModule` + async `getCompilationInfo()` check. Returns
   * the module immediately (never blocks the frame). If compilation reported
   * any `error`-type messages, dispatches a deduped {@link onRenderError} with
   * `code: 'shader-compile'` and a formatted source excerpt.
   * @internal
   */
  public _createShaderModule(code: string, label?: string): GPUShaderModule {
    const module = this.device.createShaderModule(label !== undefined ? { label, code } : { code });

    try {
      // Some mock devices return modules without getCompilationInfo; treat
      // absence (or a sync throw) as "no check available".
      const infoPromise = typeof module.getCompilationInfo === 'function' ? module.getCompilationInfo() : null;

      if (infoPromise !== null) {
        infoPromise
          .then(info => {
            const compileErrors = info.messages.filter(message => message.type === 'error');

            if (compileErrors.length === 0) {
              return;
            }

            const log = compileErrors.map(message => `:${message.lineNum}:${message.linePos} ${message.message}`).join('\n');

            this._reportRenderError(
              new RenderError({
                code: 'shader-compile',
                backendType: RenderBackendType.WebGpu,
                message: `[ExoJS] ${label ?? 'shader'}: WGSL shader failed to compile.`,
                detail: formatShaderError(code, log),
                ...(label !== undefined && { resource: label }),
              }),
            );
          })
          .catch(() => {
            /* compilation-info retrieval failure is non-fatal */
          });
      }
    } catch {
      /* no compilation-info support - skip the check */
    }

    return module;
  }

  /**
   * Dispatch `error` through {@link onRenderError}, deduplicated per unique
   * `code + message` key (capped at 100 keys - a pathological error storm
   * stops reporting new uniques beyond that). Logs through the `rendering`
   * channel on first occurrence so headless/backend-only users get the log
   * without subscribing.
   */
  private _reportRenderError(error: RenderError): void {
    const key = `${error.code}\n${error.message}`;

    if (this._reportedErrorKeys.has(key) || this._reportedErrorKeys.size >= 100) {
      return;
    }

    this._reportedErrorKeys.add(key);
    logger.error(error.message, { source: 'rendering', error });
    this.onRenderError.dispatch(error);
  }

  /** Map an uncaptured GPU error to a deduped {@link onRenderError} dispatch. */
  private _handleUncapturedError(error: unknown): void {
    let code: RenderErrorCode = 'internal';

    if (typeof GPUValidationError !== 'undefined' && error instanceof GPUValidationError) {
      code = 'validation';
    } else if (typeof GPUOutOfMemoryError !== 'undefined' && error instanceof GPUOutOfMemoryError) {
      code = 'out-of-memory';
    }

    const message = typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message : String(error);

    this._reportRenderError(
      new RenderError({
        code,
        backendType: RenderBackendType.WebGpu,
        message: `[ExoJS] WebGPU ${code} error: ${message}`,
        cause: error,
      }),
    );
  }

  /** Detach the uncapturederror listener from the current device, if any. */
  private _removeUncapturedErrorListener(): void {
    const device = this._device;

    if (device !== null && typeof device.removeEventListener === 'function') {
      device.removeEventListener('uncapturederror', this._onUncapturedError);
    }
  }

  private _createInitializationError(message: string, error: unknown): Error {
    if (error instanceof Error && error.message.length > 0) {
      return new Error(`${message} ${error.message}`);
    }

    return new Error(message);
  }

  private _destroyManagedTextures(): void {
    for (const texture of [...this._textureStates.keys()]) {
      this._evictTexture(texture);
    }
  }

  private _getTextureState(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
    let state = this._textureStates.get(texture);

    if (!state) {
      const format = this._getGpuTextureFormat(texture);
      const gpuTexture = this.device.createTexture({
        label: 'backend:texture',
        size: {
          width: Math.max(texture.width, 1),
          height: Math.max(texture.height, 1),
        },
        format,
        mipLevelCount: this._getMipLevelCount(texture),
        usage: this._getTextureUsage(texture),
      });

      const mipLevelCount = this._getMipLevelCount(texture);

      const view = gpuTexture.createView();
      const nonFilterable = this._isNonFilterable(texture);
      const samplerKey = this._samplerKey(texture.scaleMode, texture.wrapMode, nonFilterable);
      const sampler = this._getSampler(texture.scaleMode, texture.wrapMode, nonFilterable);

      state = {
        texture: gpuTexture,
        view,
        sampler,
        samplerKey,
        version: -1,
        width: texture.width,
        height: texture.height,
        mipLevelCount,
        format,
        hasContent: false,
        accountedBytes: 0,
        partialUploadScratch: null,
        partialUploadView: null,
        contiguousUploadView: null,
        binding: { view, sampler },
      };

      state.accountedBytes = this._accountant.reallocate(0, this._estimateTextureBytes(texture, mipLevelCount));

      const destroyHandler = (): void => {
        this._evictTexture(texture);
      };

      texture.addDestroyListener(destroyHandler);
      this._textureDestroyHandlers.set(texture, destroyHandler);

      if (texture instanceof Texture) {
        const releaseHandler = (): void => {
          this._evictTexture(texture, false);
        };

        texture.addReleaseListener(releaseHandler);
        this._textureReleaseHandlers.set(texture, releaseHandler);
      }

      this._textureStates.set(texture, state);
    }

    return state;
  }

  /**
   * Whether `copyExternalImageToTexture` actually writes pixels when its
   * source is a 2D `<canvas>`. Safari's WebGPU accepts the call and reports
   * no validation error, but the destination texture is left at its cleared
   * contents - a correctness bug with no capability or feature flag to read
   * it off, so this uploads a known pixel and reads it back for real.
   *
   * Runs once per backend instance, kicked off lazily on the first canvas-
   * sourced texture upload rather than during `initialize()` - an app that
   * never uses one (no `Graphics`, no gradients, no `HTMLText`) shouldn't pay
   * for it. Until it resolves, uploads fall back to the always-correct
   * `getImageData` path; this promotes them to the cheaper direct copy only
   * once actually confirmed, and stays on the fallback forever on a browser
   * where the probe reports `false` - including transparently picking up a
   * future Safari that fixes it, with no version sniffing.
   */
  private async _probeCanvasExternalImageCopy(): Promise<boolean> {
    // Held outside the try so the finally can release them whatever happens:
    // the readback maps asynchronously, and a device lost (or destroyed) in
    // that window rejects mid-probe, which would otherwise strand both.
    let probeTexture: GPUTexture | null = null;
    let readback: GPUBuffer | null = null;

    try {
      const canvas = createCanvas({ width: 2, height: 2, fillStyle: '#ff0000' });

      probeTexture = this.device.createTexture({
        label: 'backend:probe:canvas-external-image-copy',
        size: { width: 2, height: 2 },
        format: managedTextureFormat,
        // `copyExternalImageToTexture` requires RENDER_ATTACHMENT on its
        // destination, not just COPY_DST - the managed-texture path above
        // gets this for free through `_getTextureUsage`'s mipmap usage
        // (mipmapping defaults on), but this standalone probe texture has to
        // ask for it explicitly.
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this.device.queue.copyExternalImageToTexture({ source: canvas, flipY: false }, { texture: probeTexture }, { width: 2, height: 2 });

      // `copyTextureToBuffer` requires `bytesPerRow` aligned to 256 bytes,
      // unlike `writeTexture` (see the managed-texture upload above).
      const bytesPerRow = 256;

      readback = this.device.createBuffer({
        label: 'backend:probe:canvas-external-image-copy-readback',
        size: bytesPerRow * 2,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const encoder = this.device.createCommandEncoder({ label: 'backend:probe:canvas-external-image-copy-encoder' });

      encoder.copyTextureToBuffer({ texture: probeTexture }, { buffer: readback, bytesPerRow, rowsPerImage: 2 }, { width: 2, height: 2 });
      this.device.queue.submit([encoder.finish()]);

      await readback.mapAsync(GPUMapMode.READ);

      const pixel = new Uint8Array(readback.getMappedRange().slice(0, 4));

      readback.unmap();

      return pixel[0] === 255 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 255;
    } catch {
      // An unexpected failure here says nothing about the real browser
      // behaviour - stay on the always-correct fallback rather than guess.
      return false;
    } finally {
      readback?.destroy();
      probeTexture?.destroy();
    }
  }

  /**
   * Return a packing scratch view sized exactly `length`, backed by
   * `state.partialUploadScratch` (grown on demand, never shrunk, kind-matched
   * to `source`). Reusing this buffer across every partial `DataTexture`
   * upload - instead of allocating a fresh temporary array per sync - is what
   * keeps a barrier-heavy scene's per-frame CPU garbage flat instead of
   * scaling with flush count: each flush's transform (and separate tint) sync
   * would otherwise allocate its own throwaway packing buffer.
   *
   * The exact-length view over an over-sized scratch is cached alongside it
   * (`partialUploadView`), so a texture whose dirty region keeps the same size
   * - the steady state for the transform/tint pair - allocates nothing at all
   * rather than a fresh `subarray` per sync. Handing `writeTexture` the whole
   * scratch instead would also be legal (it derives its read extent from
   * `dataLayout` + `size`, and an over-sized `data` only has to satisfy
   * `offset + requiredBytesInCopy <= byteLength`), but this path has no
   * real-device test coverage, so the exact-length view stays: it is the same
   * bytes either way and does not depend on every implementation matching the
   * spec's upper bound.
   */
  private _acquirePartialUploadScratch(state: ManagedWebGpuTextureState, source: Float32Array | Uint8Array, length: number): Float32Array | Uint8Array {
    const isFloat = source instanceof Float32Array;
    let scratch = state.partialUploadScratch;

    if (scratch === null || scratch.length < length || isFloat !== scratch instanceof Float32Array) {
      scratch = isFloat ? new Float32Array(length) : new Uint8Array(length);
      state.partialUploadScratch = scratch;
      // The cached view belongs to the replaced buffer - drop it with it.
      state.partialUploadView = null;
    }

    if (scratch.length === length) {
      return scratch;
    }

    let view = state.partialUploadView;

    if (view?.length !== length) {
      view = scratch.subarray(0, length);
      state.partialUploadView = view;
    }

    return view;
  }

  /**
   * Return an exact-length view over `source` covering `length` elements from
   * `start`, for a dirty region whose rows span the full texture width and are
   * therefore already contiguous in the row-major buffer.
   *
   * `writeTexture` copies out of whatever `ArrayBufferView` it is handed, so a
   * contiguous region needs no packing step at all - the packing scratch would
   * only add a full memcpy of the region per sync. The view is exact-length
   * rather than the whole buffer plus a `dataLayout.offset`, so validation
   * never has to lean on the spec's `offset + requiredBytesInCopy <=
   * byteLength` upper bound.
   *
   * The view is cached the same way the scratch's is: a band of the same size
   * at the same offset - a scrolling ring buffer's steady state - then
   * allocates nothing. Identity is re-checked against the source, so a texture
   * whose region moves or resizes simply mints a new view.
   */
  private _acquireContiguousUploadView(
    state: ManagedWebGpuTextureState,
    source: Float32Array | Uint8Array,
    start: number,
    length: number,
  ): Float32Array | Uint8Array {
    const view = state.contiguousUploadView;
    const byteOffset = source.byteOffset + start * source.BYTES_PER_ELEMENT;

    if (
      view !== null &&
      view.length === length &&
      view.byteOffset === byteOffset &&
      view.buffer === source.buffer &&
      view instanceof Float32Array === source instanceof Float32Array
    ) {
      return view;
    }

    const fresh = source.subarray(start, start + length);

    state.contiguousUploadView = fresh;

    return fresh;
  }

  private _syncTexture(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
    assertLiveTexture(texture);

    // A texture whose image has not arrived yet is a lifecycle state, not a
    // caller error: the upload is skipped and the version left unstamped, so
    // the next frame that finds a source performs it. Raising here instead
    // ended the application rather than the frame - the frame guard halts the
    // loop after three consecutive throws, and a drawable that keeps its own
    // geometry (a `Mesh`, unlike a `Sprite` that measures 0x0 and is never
    // submitted) reaches this on every one of them. WebGl2Backend skips the
    // upload the same way.
    const awaitingSource =
      !(texture instanceof RenderTexture) &&
      !(texture instanceof DataTexture) &&
      texture.compressed === null &&
      (texture.source === null || texture.width === 0 || texture.height === 0);

    const state = this._getTextureState(texture);
    const compressedPayload = compressedPayloadOf(texture);
    const textureVersion = texture instanceof RenderTexture ? texture.textureVersion : texture.version;
    const mipLevelCount = this._getMipLevelCount(texture);
    const nonFilterable = this._isNonFilterable(texture);
    const samplerKey = this._samplerKey(texture.scaleMode, texture.wrapMode, nonFilterable);

    if (state.samplerKey !== samplerKey) {
      state.samplerKey = samplerKey;
      state.sampler = this._getSampler(texture.scaleMode, texture.wrapMode, nonFilterable);
    }

    if (!awaitingSource && state.version !== textureVersion) {
      const gpuFormat = this._getGpuTextureFormat(texture);

      if (state.width !== texture.width || state.height !== texture.height || state.mipLevelCount !== mipLevelCount || state.format !== gpuFormat) {
        state.texture.destroy();

        const resizedTexture = this.device.createTexture({
          label: 'backend:texture:resize',
          size: {
            width: texture.width,
            height: texture.height,
          },
          format: gpuFormat,
          mipLevelCount,
          usage: this._getTextureUsage(texture),
        });

        state.texture = resizedTexture;
        state.view = resizedTexture.createView();
        state.width = texture.width;
        state.height = texture.height;
        state.mipLevelCount = mipLevelCount;
        state.format = gpuFormat;
        state.hasContent = false;
        // Free the previous storage before booking the new size (no transient spike).
        state.accountedBytes = this._accountant.reallocate(state.accountedBytes, this._estimateTextureBytes(texture, mipLevelCount));
      }

      if (texture instanceof DataTexture) {
        // `instanceof DataTexture` narrows to `DataTexture<any>` (the generic is
        // erased), so `texture.format` widens to `any`; the class invariant
        // guarantees it is a `DataTextureFormat`, so restore that type here.
        const format: DataTextureFormat = texture.format;
        const formatInfo = webgpuDataTextureFormat(format);
        const region = texture._consumeDirtyRegion();
        const isFullUpload = region === null || region.full || !state.hasContent;

        if (isFullUpload) {
          this.device.queue.writeTexture(
            { texture: state.texture },
            texture.buffer,
            {
              bytesPerRow: texture.width * formatInfo.bytesPerPixel,
              rowsPerImage: texture.height,
            },
            { width: texture.width, height: texture.height },
          );
          this._accountant.recordTextureUpload(texture.width * texture.height * formatInfo.bytesPerPixel);
        } else {
          // Partial upload. `queue.writeTexture` reads a tightly packed block,
          // so unless the dirty rows span the full texture width they have to
          // be lifted out of the row-major buffer first - into a reusable
          // scratch view (grown once, never reallocated per call - see
          // `_acquirePartialUploadScratch`). `queue.writeTexture` snapshots the
          // bytes at call time, so the same buffer is free to be repacked on
          // the very next sync.
          const channels = formatInfo.channels;
          const bytesPerPixel = formatInfo.bytesPerPixel;
          const rowChannels = texture.width * channels;
          const subRowChannels = region.width * channels;
          const length = region.width * region.height * channels;
          let subBuffer: Float32Array | Uint8Array;

          if (region.x === 0 && region.width === texture.width) {
            // Full-width rows are already contiguous and tightly packed - hand
            // `writeTexture` a view straight onto the texture buffer and skip
            // the packing copy entirely. This is the shape every ring-buffer
            // style upload takes (transform/tint rows, scrolling spectrograms),
            // so it is the common case rather than a corner one.
            subBuffer = this._acquireContiguousUploadView(state, texture.buffer, region.y * rowChannels, length);
          } else {
            subBuffer = this._acquirePartialUploadScratch(state, texture.buffer, length);

            for (let row = 0; row < region.height; row++) {
              const sourceStart = (region.y + row) * rowChannels + region.x * channels;
              const targetStart = row * subRowChannels;
              subBuffer.set(texture.buffer.subarray(sourceStart, sourceStart + subRowChannels), targetStart);
            }
          }

          this.device.queue.writeTexture(
            { texture: state.texture, origin: { x: region.x, y: region.y } },
            subBuffer,
            { bytesPerRow: region.width * bytesPerPixel, rowsPerImage: region.height },
            { width: region.width, height: region.height },
          );
          this._accountant.recordTextureUpload(region.width * region.height * bytesPerPixel);
        }

        state.hasContent = true;
      } else if (compressedPayload !== null) {
        const { format: compressedFormat, levels } = compressedPayload;
        const { blockWidth, blockHeight, bytesPerBlock } = compressedBlockLayout(compressedFormat);

        for (const [mipLevel, level] of levels.entries()) {
          const blocksAcross = compressedBlocksAcross(compressedFormat, level.width);
          const blocksDown = compressedBlocksDown(compressedFormat, level.height);

          // `bytesPerRow` counts BLOCK rows, not texel rows, and the write extent
          // is padded up to whole blocks - a 5x5 ASTC 4x4 level is a 2x2 block
          // grid. Passing the texel width here would under-run the driver's read
          // by the block size and corrupt every level.
          this.device.queue.writeTexture(
            { texture: state.texture, mipLevel },
            level.data,
            { bytesPerRow: blocksAcross * bytesPerBlock, rowsPerImage: blocksDown },
            { width: blocksAcross * blockWidth, height: blocksDown * blockHeight },
          );
          this._accountant.recordTextureUpload(level.data.byteLength);
        }

        state.hasContent = true;
      } else if (!(texture instanceof RenderTexture)) {
        const source = texture.source!;

        // `copyExternalImageToTexture` from a <canvas> silently uploads nothing
        // on Safari's WebGPU - the destination texture stays at its cleared
        // contents and no validation error surfaces to catch it. `getImageData`
        // + `writeTexture` reads the same unpremultiplied bytes `rgba8unorm`
        // (this backend's managed texture format) expects, so it produces an
        // identical upload on browsers where the external-image path already
        // works - but it forces a GPU→CPU→GPU round trip that
        // `copyExternalImageToTexture` normally avoids, so it only runs while
        // `_canvasExternalImageCopySupported` isn't confirmed `true` (unknown,
        // still probing, or confirmed broken). See
        // `_probeCanvasExternalImageCopy`.
        //
        // The fallback needs a 2D context, and `getContext('2d')` returns null
        // on a canvas already bound to another context type - a WebGL minimap,
        // a `bitmaprenderer` target. `TextureSource` accepts those, and
        // `copyExternalImageToTexture` handles them, so they take the direct
        // path rather than failing the upload. On Safari that leaves them
        // subject to the very bug worked around here, but no fallback exists:
        // their pixels are not readable from the CPU side.
        const canvasSource = isCanvasTextureSource(source) ? source : null;

        if (canvasSource !== null && this._canvasExternalImageCopySupported !== true && !this._canvasExternalImageCopyProbeStarted) {
          this._canvasExternalImageCopyProbeStarted = true;
          void this._probeCanvasExternalImageCopy().then(supported => {
            this._canvasExternalImageCopySupported = supported;
          });
        }

        const canvasReadbackContext = canvasSource !== null && this._canvasExternalImageCopySupported !== true ? get2dContext(canvasSource) : null;

        if (canvasReadbackContext !== null) {
          const { data } = canvasReadbackContext.getImageData(0, 0, texture.width, texture.height);

          this.device.queue.writeTexture(
            { texture: state.texture },
            data,
            { bytesPerRow: texture.width * MANAGED_TEXTURE_BYTES_PER_PIXEL, rowsPerImage: texture.height },
            { width: texture.width, height: texture.height },
          );
        } else {
          this.device.queue.copyExternalImageToTexture(
            {
              source,
              flipY: false,
            },
            {
              texture: state.texture,
            },
            {
              width: texture.width,
              height: texture.height,
            },
          );
        }

        this._accountant.recordTextureUpload(texture.width * texture.height * MANAGED_TEXTURE_BYTES_PER_PIXEL);

        if (state.mipLevelCount > 1) {
          this._generateMipmaps(state.texture, state.mipLevelCount);
        }
      }

      state.version = textureVersion;
    }

    return state;
  }

  /**
   * Free a texture's GPU-side state. `unsubscribeDestroy` is `false` only
   * when called from a {@link Texture.releaseGpu} listener: the handle isn't
   * actually destroyed there, so the destroy subscription must survive for a
   * real, later `destroy()`. The release subscription is always dropped -
   * `_getTextureState` re-subscribes it fresh if the handle is bound again.
   */
  private _evictTexture(texture: Texture | RenderTexture, unsubscribeDestroy = true): void {
    const state = this._textureStates.get(texture);

    if (unsubscribeDestroy) {
      const destroyHandler = this._textureDestroyHandlers.get(texture);

      if (destroyHandler) {
        texture.removeDestroyListener(destroyHandler);
        this._textureDestroyHandlers.delete(texture);
      }
    }

    if (texture instanceof Texture) {
      const releaseHandler = this._textureReleaseHandlers.get(texture);

      if (releaseHandler) {
        texture.removeReleaseListener(releaseHandler);
        this._textureReleaseHandlers.delete(texture);
      }
    }

    if (state) {
      // Destroying a GPUTexture an open pass still references would invalidate
      // the pending merged command buffer at submit (the whole frame's draws
      // would be dropped). End (submit) the open pass first so its recorded
      // draws are captured before the resource goes away. Reachable when user
      // code destroys a texture mid-frame between two same-frame render() calls;
      // never called from within a renderer flush, so this is not reentrant.
      if (this._passCoordinatorInstance?.hasActivePass === true) {
        this._flushActiveRendererAndEndPass();
      }

      state.texture.destroy();
      this._accountant.free(state.accountedBytes);
      state.accountedBytes = 0;
      this._textureStates.delete(texture);
    }

    if (this._texture === texture) {
      this._texture = null;
    }
  }

  private _subscribeRenderTarget(target: RenderTarget): void {
    if (!this._renderTargetDestroyHandlers.has(target)) {
      const destroyHandler = (): void => {
        if (this._renderTarget === target) {
          this._renderTarget = this._rootRenderTarget;
        }

        this._passCoordinatorInstance?.releaseStencilTarget(target);
        this._renderTargetDestroyHandlers.delete(target);
      };

      target.addDestroyListener(destroyHandler);
      this._renderTargetDestroyHandlers.set(target, destroyHandler);
    }
  }

  private _unsubscribeRenderTarget(target: RenderTarget): void {
    const destroyHandler = this._renderTargetDestroyHandlers.get(target);

    if (destroyHandler) {
      target.removeDestroyListener(destroyHandler);
      this._renderTargetDestroyHandlers.delete(target);
    }
  }

  /** Writes into `out` and returns it - see {@link _clipPixelStack} for why nothing here allocates. */
  private _toClipPixels(bounds: Rectangle, out: PixelClipBoundsState): PixelClipBoundsState {
    const topLeft = this._renderTarget._mapCoordsToPixelInPlace(this._clipPointA.set(bounds.left, bounds.top));
    const bottomRight = this._renderTarget._mapCoordsToPixelInPlace(this._clipPointB.set(bounds.right, bounds.bottom));
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const targetWidth = this._renderTarget.width;
    const targetHeight = this._renderTarget.height;
    const x = Math.max(0, Math.min(targetWidth, Math.floor(minX)));
    const right = Math.max(0, Math.min(targetWidth, Math.ceil(maxX)));
    const y = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
    const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
    const width = Math.max(0, right - x);
    const height = Math.max(0, bottom - y);

    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;

    return out;
  }

  /** Writes the intersection into `out`, which may alias neither input. */
  private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState, out: PixelClipBoundsState): void {
    const left = Math.max(first.x, second.x);
    const top = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const bottom = Math.min(first.y + first.height, second.y + second.height);

    out.x = left;
    out.y = top;
    out.width = Math.max(0, right - left);
    out.height = Math.max(0, bottom - top);
  }

  /**
   * Float32 textures (r32float, rgba32float) are non-filterable by default in
   * WebGPU, so a linear sampler on one is a validation error. Apps that need
   * linear filtering on floats can opt into the 'float32-filterable' device
   * feature, which this backend does not expose yet.
   */
  private _isNonFilterable(texture: Texture | RenderTexture): boolean {
    return texture instanceof DataTexture && (texture.format === TextureFormat.R32F || texture.format === TextureFormat.Rgba32F);
  }

  /**
   * Cache key covering everything {@link _getSampler} reads. The non-filterable
   * flag is part of it because it overrides both filter fields, so two textures
   * with the same modes but different formats need different samplers.
   */
  private _samplerKey(scaleMode: ScaleModes, wrapMode: WrapModes, nonFilterable: boolean): number {
    return samplerStateKey(scaleMode, wrapMode) + (nonFilterable ? NON_FILTERABLE_SAMPLER_KEY_BIT : 0);
  }

  /**
   * The device's sampler for one sampling state, created on first use.
   *
   * Sampling state is a small closed set, so every texture and every material
   * override in a scene shares a handful of samplers. Deriving them here rather
   * than per texture also keeps a texture that re-uploads every frame (video,
   * a canvas redrawn per frame) from minting a sampler per frame.
   */
  private _getSampler(scaleMode: ScaleModes, wrapMode: WrapModes, nonFilterable: boolean): GPUSampler {
    const key = this._samplerKey(scaleMode, wrapMode, nonFilterable);
    const existing = this._samplers.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const filter: GPUFilterMode = nonFilterable ? 'nearest' : this._getFilterMode(scaleMode);
    const addressMode = this._getAddressMode(wrapMode);
    const sampler = this.device.createSampler({
      label: 'backend:sampler',
      addressModeU: addressMode,
      addressModeV: addressMode,
      magFilter: filter,
      minFilter: filter,
      mipmapFilter: nonFilterable ? 'nearest' : this._getMipmapFilterMode(scaleMode),
    });

    this._samplers.set(key, sampler);

    return sampler;
  }

  private _getGpuTextureFormat(texture: Texture | RenderTexture): GPUTextureFormat {
    if (texture instanceof DataTexture) {
      // `instanceof DataTexture` erases the generic, widening `format` to `any`;
      // the class invariant guarantees it is a `DataTextureFormat`.
      const format: DataTextureFormat = texture.format;
      return webgpuDataTextureFormat(format).gpuFormat;
    }
    if (texture instanceof RenderTexture) {
      return webgpuColorTextureFormat(texture.format);
    }
    const compressed = compressedPayloadOf(texture);

    if (compressed !== null) {
      const gpuFormat = this._compressedFormats.gpuFormats.get(compressed.format);
      if (gpuFormat === undefined) {
        throw new RenderError({
          code: 'unsupported-format',
          backendType: RenderBackendType.WebGpu,
          message: `This device cannot sample the compressed texture format "${compressed.format}". Declare an asset variant this device supports, or check backend.supportedTextureFormats before constructing the texture.`,
        });
      }
      return gpuFormat;
    }
    return managedTextureFormat;
  }

  private _getTextureUsage(texture: Texture | RenderTexture): number {
    // RENDER_ATTACHMENT exists purely so `_generateMipmaps` can render into the
    // smaller levels. A compressed format is not renderable at all, so asking
    // for it would fail texture creation outright - and there is nothing to
    // generate, because the chain arrives complete.
    if (compressedPayloadOf(texture) !== null) {
      return GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING;
    }

    const mipmapUsage = this._getMipLevelCount(texture) > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0;

    if (texture instanceof RenderTexture) {
      // COPY_SRC is required by WebGpuBackdropBlendCompositor to capture the
      // backdrop from an offscreen RenderTexture target via copyTextureToTexture.
      return GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | mipmapUsage;
    }

    const externalImageUsage = texture instanceof DataTexture ? 0 : GPUTextureUsage.RENDER_ATTACHMENT;

    return GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | mipmapUsage | externalImageUsage;
  }

  private _getAddressMode(wrapMode: WrapModes): GPUAddressMode {
    switch (wrapMode) {
      case WrapModes.Repeat:
        return 'repeat';
      case WrapModes.MirroredRepeat:
        return 'mirror-repeat';
      default:
        return 'clamp-to-edge';
    }
  }

  private _getFilterMode(scaleMode: ScaleModes): GPUFilterMode {
    switch (scaleMode) {
      case ScaleModes.Nearest:
      case ScaleModes.NearestMipmapNearest:
      case ScaleModes.NearestMipmapLinear:
        return 'nearest';
      default:
        return 'linear';
    }
  }

  private _getMipmapFilterMode(scaleMode: ScaleModes): GPUMipmapFilterMode {
    switch (scaleMode) {
      case ScaleModes.NearestMipmapLinear:
      case ScaleModes.LinearMipmapLinear:
        return 'linear';
      default:
        return 'nearest';
    }
  }

  /** Bytes per pixel for a texture's GPU format (DataTexture formats, else managed `rgba8unorm`). */
  private _textureBytesPerPixel(texture: Texture | RenderTexture): number {
    if (texture instanceof DataTexture) {
      // `instanceof DataTexture` erases the generic, widening `format` to `any`;
      // the class invariant guarantees it is a `DataTextureFormat`.
      const format: DataTextureFormat = texture.format;
      return dataTextureBytesPerPixel(format);
    }

    const compressed = compressedPayloadOf(texture);

    if (compressed !== null) {
      const { blockWidth, blockHeight, bytesPerBlock } = compressedBlockLayout(compressed.format);

      return bytesPerBlock / (blockWidth * blockHeight);
    }

    return MANAGED_TEXTURE_BYTES_PER_PIXEL;
  }

  /** Estimated VRAM bytes for a texture's storage (base level + mip chain). */
  private _estimateTextureBytes(texture: Texture | RenderTexture, mipLevelCount: number): number {
    return estimateTextureBytes(texture.width, texture.height, this._textureBytesPerPixel(texture), mipLevelCount);
  }

  private _getMipLevelCount(texture: Texture | RenderTexture): number {
    // A compressed payload carries whatever chain the container shipped; the GPU
    // cannot derive one from compressed blocks, so `generateMipMap` says nothing
    // about it and the level count comes from the levels themselves.
    const compressed = compressedPayloadOf(texture);

    if (compressed !== null) {
      return compressed.levels.length;
    }

    if (!texture.generateMipMap) {
      return 1;
    }

    const maxSize = Math.max(texture.width, texture.height);

    if (maxSize <= 1) {
      return 1;
    }

    return Math.floor(Math.log2(maxSize)) + 1;
  }

  private _generateMipmaps(texture: GPUTexture, mipLevelCount: number): void {
    if (mipLevelCount <= 1) {
      return;
    }

    const resources = this._getMipmapResources();
    const encoder = this.device.createCommandEncoder({ label: 'backend:command-encoder' });

    for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
      const bindGroup = this.device.createBindGroup({
        label: 'backend:bind-group',
        layout: resources.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: texture.createView({
              baseMipLevel: mipLevel - 1,
              mipLevelCount: 1,
            }),
          },
          {
            binding: 1,
            resource: resources.sampler,
          },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: 'backend:render-pass',
        colorAttachments: [
          {
            view: texture.createView({
              baseMipLevel: mipLevel,
              mipLevelCount: 1,
            }),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });

      pass.setPipeline(resources.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  private _getMipmapResources(): {
    readonly bindGroupLayout: GPUBindGroupLayout;
    readonly pipeline: GPURenderPipeline;
    readonly sampler: GPUSampler;
  } {
    if (
      this._mipmapShaderModule === null ||
      this._mipmapBindGroupLayout === null ||
      this._mipmapPipelineLayout === null ||
      this._mipmapPipeline === null ||
      this._mipmapSampler === null
    ) {
      this._mipmapShaderModule = this.device.createShaderModule({
        label: 'backend:mipmap-shader',
        code: mipmapWgsl,
      });
      this._mipmapBindGroupLayout = this.device.createBindGroupLayout({
        label: 'backend:mipmap-bind-group-layout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: 'float',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {
              type: 'filtering',
            },
          },
        ],
      });
      this._mipmapPipelineLayout = this.device.createPipelineLayout({
        label: 'backend:mipmap-pipeline-layout',
        bindGroupLayouts: [this._mipmapBindGroupLayout],
      });
      this._mipmapPipeline = this.device.createRenderPipeline({
        label: 'backend:mipmap-pipeline',
        layout: this._mipmapPipelineLayout,
        vertex: {
          module: this._mipmapShaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: this._mipmapShaderModule,
          entryPoint: 'fragmentMain',
          targets: [
            {
              format: managedTextureFormat,
              writeMask: GPUColorWrite.ALL,
            },
          ],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });
      this._mipmapSampler = this.device.createSampler({
        label: 'backend:mipmap-sampler',
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'nearest',
      });
    }

    return {
      bindGroupLayout: this._mipmapBindGroupLayout,
      pipeline: this._mipmapPipeline,
      sampler: this._mipmapSampler,
    };
  }
}

interface WebGpuDataTextureFormatInfo {
  readonly gpuFormat: GPUTextureFormat;
  readonly bytesPerPixel: number;
  readonly channels: number;
}

/**
 * Whether the source is a canvas whose pixels can be read back from the CPU
 * side, which is what the Safari external-image workaround needs. Both canvas
 * kinds qualify; an image, bitmap or video frame does not.
 */
const isCanvasTextureSource = (source: TextureSource): source is HTMLCanvasElement | OffscreenCanvas =>
  (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) ||
  (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas);

/** Map a {@link RenderTexture} color format to its WebGPU render-target format. */
const webgpuColorTextureFormat = (format: ColorTextureFormat): GPUTextureFormat => {
  switch (format) {
    case TextureFormat.Rgba8:
      return 'rgba8unorm';
    case TextureFormat.Rgba16F:
      return 'rgba16float';
    case TextureFormat.Rgba32F:
      return 'rgba32float';
  }
};

const webgpuDataTextureFormat = (format: DataTextureFormat): WebGpuDataTextureFormatInfo => {
  switch (format) {
    case TextureFormat.R8:
      return { gpuFormat: 'r8unorm', bytesPerPixel: 1, channels: 1 };
    case TextureFormat.R32F:
      return { gpuFormat: 'r32float', bytesPerPixel: 4, channels: 1 };
    case TextureFormat.Rgba8:
      return { gpuFormat: 'rgba8unorm', bytesPerPixel: 4, channels: 4 };
    case TextureFormat.Rgba32F:
      return { gpuFormat: 'rgba32float', bytesPerPixel: 16, channels: 4 };
  }
};
