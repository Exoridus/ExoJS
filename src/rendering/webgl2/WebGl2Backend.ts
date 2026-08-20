import type { Application, CanvasAlphaMode, RenderingApplicationOptions } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { assertLiveRenderTarget, assertLiveTexture } from '#rendering/assertLiveResource';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import { dataTextureBytesPerPixel, estimateTextureBytes, GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { Mesh } from '#rendering/mesh/Mesh';
import type { PersistentSlotBundle } from '#rendering/plan/PersistentSlotDraw';
import { type DrawCommand, drawCommandUsesSharedTransform, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import type { ScopeEntry } from '#rendering/plan/RenderScope';
import {
  type RetainedBatchCapableRenderer,
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
import type { RenderError } from '#rendering/RenderError';
import type { RenderStats } from '#rendering/RenderStats';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexturePool } from '#rendering/RenderTexturePool';
import type { Shader } from '#rendering/shader/Shader';
import {
  createTransformTextureLayout,
  createTransformTextureRect,
  tintTextureRect,
  type TransformTextureLayout,
  transformTextureRect,
} from '#rendering/shader/transformTextureLayout';
import { DataTexture, type DataTextureFormat } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { type SamplerOptions, samplerStateKey } from '#rendering/texture/TextureOptions';
import { TransformBuffer } from '#rendering/TransformBuffer';
import { BlendModes, type ColorTextureFormat, TextureFormat } from '#rendering/types';
import type { View } from '#rendering/View';

import { WebGl2BackdropBlendCompositor } from './WebGl2BackdropBlendCompositor';
import { WebGl2MaskCompositor } from './WebGl2MaskCompositor';
import { WebGl2MeshRenderer } from './WebGl2MeshRenderer';
import { WebGl2PassCoordinator } from './WebGl2PassCoordinator';
import type { PersistentSlotCapableRenderer, WebGl2PersistentSlotStore } from './WebGl2PersistentSlotStore';
import {
  type WebGl2RecordedTextureState,
  type WebGl2RetainedBatchPayload,
  type WebGl2RetainedBatchReplayer,
  type WebGl2RetainedGeometryRef,
  WebGl2RetainedGroupResources,
  type WebGl2RetainedNodeIndexRange,
} from './WebGl2RetainedGroupResources';
import { WebGl2StencilClipper } from './WebGl2StencilClipper';
import type { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';

// Inline GL debug helpers — replaces the webgl-debug vendor lib.
// Used only in dev builds when renderingOptions.debug = true (see __DEV__ gates below).
const glEnumToString = (gl: WebGL2RenderingContext, value: number): string => {
  const ctor = gl.constructor as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(ctor)) {
    if (ctor[key] === value) return key;
  }
  return `0x${value.toString(16).padStart(4, '0').toUpperCase()}`;
};

const glArgsToString = (gl: WebGL2RenderingContext, args: unknown[]): string =>
  args.map(a => (typeof a === 'number' ? glEnumToString(gl, a) : String(a))).join(', ');

const makeWebGl2DebugContext = (gl: WebGL2RenderingContext): WebGL2RenderingContext =>
  new Proxy(gl, {
    get(target, prop, receiver) {
      // `Reflect.get` is typed `any`; contain it as `unknown` so the non-function
      // branch returns a safe value and the function branch narrows via `typeof`.
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const name = String(prop);
      return (...args: unknown[]) => {
        if (__DEV__) {
          console.log(`gl.${name}(${glArgsToString(target, args)})`);
          for (const arg of args) {
            if (arg === undefined) {
              console.error(`undefined passed to gl.${name}(${glArgsToString(target, args)})`);
            }
          }
        }
        const result = Reflect.apply(value as (...a: unknown[]) => unknown, target, args);
        if (name !== 'getError') {
          const err = target.getError();
          if (err !== target.NO_ERROR) {
            throw new Error(`${glEnumToString(target, err)} was caused by call to: ${name}`);
          }
        }
        return result;
      };
    },
  });

interface ManagedTextureState {
  readonly handle: WebGLTexture;
  /**
   * Sampling state the handle's filter/wrap parameters were last set from.
   * Tracked separately from `version` because GL keeps those parameters on the
   * texture object: a content re-upload must not re-issue them, and a
   * filter/wrap change must not drag a full re-upload along with it.
   */
  samplerKey: number;
  version: number;
  width: number;
  height: number;
  /** GPU bytes currently booked for this texture's storage (0 until first upload). */
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
}

interface ManagedRenderTargetState {
  framebuffer: WebGLFramebuffer | null;
  version: number;
  attachedTexture: WebGLTexture | null;
  stencilRenderbuffer: WebGLRenderbuffer | null;
  stencilWidth: number;
  stencilHeight: number;
}

interface StencilClipEntry {
  readonly shape: Geometry;
  readonly transform: Matrix;
}

// Stencil clipping is per-target: each framebuffer owns its stencil buffer, so
// a clip established on one target must not affect rendering into another
// (e.g. an alpha-mask capture nested inside a stencil clip). State is keyed by
// the target it was pushed on and re-applied on every target switch.
interface StencilTargetState {
  depth: number;
  stack: StencilClipEntry[];
}

interface PixelClipBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DestroyListenable {
  addDestroyListener(listener: () => void): unknown;
  removeDestroyListener(listener: () => void): unknown;
}

interface ReleaseListenable {
  addReleaseListener(listener: () => void): unknown;
  removeReleaseListener(listener: () => void): unknown;
}

// One open retained-capture window. Frames stack for nested
// recording groups: a flushed batch's bytes are stored once in the
// INNERMOST frame's bundle, while its instruction is appended to every open
// frame's set. `payloads` collects this frame's own recorded batches for the
// capture-end finalize (node-index rebase, transform-row copy, VAO wiring).
interface RetainedCaptureFrame {
  readonly set: RetainedInstructionSet;
  readonly bundle: WebGl2RetainedGroupResources;
  readonly payloads: WebGl2RetainedBatchPayload[];
  /**
   * This frame's own batch instructions, created with the unstamped
   * generation sentinel and stamped at capture end via the official
   * plan-layer seam (after the bundle finalize; a capture that never
   * finalizes — context loss — leaves them unstamped and the set invalid).
   */
  readonly instructions: RetainedBatchInstruction[];
}

// Scratch texture unit used to sync a RenderTexture target's color texture
// (see _prepareRenderTarget). _syncTexture binds on the active unit and only
// the ACTIVE unit is restored afterwards — the binding itself stays. The unit
// must therefore be one no shader program ever samples: units 0..15 are the
// sprite batcher's base-texture slots and unit 16 hosts the shared transform
// buffer texture, so the scratch unit sits above them at 17 (WebGL2 guarantees
// MAX_COMBINED_TEXTURE_IMAGE_UNITS >= 32). A stale render-target binding on a
// sampled unit while that texture is the FBO color attachment is a WebGL
// feedback loop: INVALID_OPERATION, whole draw dropped.
const renderTargetTextureSyncUnit = 17;

/**
 * Row length (in channels) from which packing a rectangular texture region
 * switches from a plain element loop to `set(subarray(…))`.
 *
 * `set` copies natively but needs a view per row, and below roughly this length
 * the call overhead outweighs the copy: measured per pack, 8x8 rows 74 ns
 * (loop) vs 421 ns (set) and 32x32 rows 1.20 us vs 1.66 us, flipping at 48–64
 * to 4.5 us vs 3.9 us at 64x64 and 10.5 us vs 6.0 us at 96x96. Glyph-atlas
 * updates — the only rectangular region the engine itself produces — sit on the
 * small side, where the loop is both faster AND allocation-free (a 32x32 pack
 * allocated 3.3 KB of row views).
 */
const nativeRowCopyThreshold = 48;

/**
 * WebGL 2.0 implementation of {@link RenderBackend}. Manages the GL
 * context, texture and framebuffer caches keyed by user-side
 * {@link Texture}/{@link RenderTexture} identity, the active VAO, shader
 * program, blend mode, and scissor stack. Dispatches to per-drawable
 * renderers ({@link WebGl2SpriteRenderer}, {@link WebGl2MeshRenderer},
 * {@link WebGl2ParticleRenderer}) registered in the {@link RendererRegistry}.
 *
 * Emits {@link WebGl2Backend.onContextLost} / {@link WebGl2Backend.onContextRestored}
 * Signals when the browser loses or regains the GL context. On loss the
 * `webglcontextlost` default is cancelled (`preventDefault`) so the browser
 * schedules a `webglcontextrestored` event; on restore every device-bound GL
 * object (texture / framebuffer / renderbuffer handles, renderer buffers, VAOs
 * and shader programs, the shared transform texture, compositors and retained
 * bundles) is evicted and rebuilt against the fresh context — mirroring the
 * WebGPU backend's `_teardownDeviceState`. See {@link _reinitializeDeviceState}.
 */
export class WebGl2Backend implements RenderBackend {
  public readonly backendType = RenderBackendType.WebGl2;
  public readonly rendererRegistry: RendererRegistry<WebGl2Backend> = new RendererRegistry<WebGl2Backend>();
  public readonly onContextLost = new Signal();
  public readonly onContextRestored = new Signal();
  /**
   * See {@link RenderBackend.onRenderError}. WebGL2 currently dispatches
   * nothing here — its shader compile/link failures surface as synchronous
   * {@link RenderError} throws from `flush()` — but the signal satisfies the
   * backend interface and gives custom passes a stable reporting surface.
   */
  public readonly onRenderError = new Signal<[RenderError]>();

  private readonly _context: WebGL2RenderingContext;
  private readonly _rootRenderTarget: RenderTarget;
  private readonly _onContextLostHandler: (event: Event) => void;
  private readonly _onContextRestoredHandler: () => void;
  private readonly _textureStates: Map<Texture | RenderTexture, ManagedTextureState> = new Map<Texture | RenderTexture, ManagedTextureState>();
  private readonly _renderTargetStates: Map<RenderTarget, ManagedRenderTargetState> = new Map<RenderTarget, ManagedRenderTargetState>();
  private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
  private readonly _textureReleaseHandlers: Map<Texture, () => void> = new Map<Texture, () => void>();
  /** Context-local base-texture sampler overrides shared by custom materials. */
  private readonly _materialSamplers = new Map<number, WebGLSampler>();
  private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
  private readonly _renderTexturePool: RenderTexturePool = new RenderTexturePool();
  /**
   * Resolved scissor rectangles in target pixels, innermost at
   * `_clipDepth - 1`.
   *
   * Grow-only and reused: the entries are plain mutable records rewritten on
   * push, and {@link _clipDepth} — not `length` — says how many are live. A
   * clip push happens once per clipped or masked barrier per frame, so
   * allocating the record (plus the intersection's) there put four objects per
   * barrier on the steady-state path for a stack that never gets deep.
   */
  private readonly _clipPixelStack: PixelClipBoundsState[] = [];
  private _clipDepth = 0;
  /** Scratch for the incoming rect before it is intersected into its slot. */
  private readonly _clipPixelScratch: PixelClipBoundsState = { x: 0, y: 0, width: 0, height: 0 };
  private readonly _clipPointA: Vector = new Vector();
  private readonly _clipPointB: Vector = new Vector();
  private readonly _maskCompositor: WebGl2MaskCompositor = new WebGl2MaskCompositor();
  private _maskCompositorConnected = false;
  private readonly _backdropBlendCompositor: WebGl2BackdropBlendCompositor = new WebGl2BackdropBlendCompositor();
  private _backdropBlendCompositorConnected = false;
  private readonly _stencilClipper: WebGl2StencilClipper = new WebGl2StencilClipper();
  private readonly _stencilStates: Map<RenderTarget, StencilTargetState> = new Map<RenderTarget, StencilTargetState>();
  private _stencilClipperConnected = false;
  private _passCoordinatorInstance: WebGl2PassCoordinator | null = null;

  private _canvas: HTMLCanvasElement;
  private _contextLost: boolean;
  private _destroyed = false;
  private _pendingRestore: ReturnType<typeof setTimeout> | null = null;
  // Cached BEFORE any context loss: `restoreContext()` only restores the
  // context when invoked on the same extension instance `loseContext()` was
  // triggered on. A fresh `getExtension()` after the loss returns a different
  // object that cannot drive the restore (verified against headless Chromium).
  private readonly _loseContextExtension: WEBGL_lose_context | null;
  /** Whether `EXT_color_buffer_float` is available (float RenderTexture targets are renderable). */
  private _floatRenderable = false;
  // This context's `gl.MAX_TEXTURE_SIZE`. Caps both dimensions of the shared
  // transform/tint textures, so the transform store's layout consults it to
  // reject an impossible capacity up front instead of letting `texImage2D` fail
  // with GL_INVALID_VALUE and leave every transform fetch reading an incomplete
  // texture (a black frame). Re-read after a context restore.
  private _maxTextureSize = 0;
  /** The application's `canvas.pixelRatio`, sanitized once - see {@link surfacePixelRatio}. */
  private readonly _surfacePixelRatio: number;
  private _renderTarget: RenderTarget;
  // Device-pixel viewport rect last handed to `gl.viewport` (x, y, width,
  // height). Cached at the bind seam so the vertex shaders can map a drawable's
  // clip-space origin into device pixels for GPU-side position snapping.
  private readonly _deviceViewport = { x: 0, y: 0, width: 0, height: 0 };
  private readonly _viewportUniformScratch = new Float32Array(4);
  private _renderer: Renderer | null = null;
  private _renderGroupTransform: Matrix | null = null;
  private _renderGroupTransformId = 0;
  private _shader: Shader | null = null;
  private _blendMode: BlendModes | null = null;
  // What GL currently has bound to TEXTURE_2D on each texture unit, indexed by
  // unit. Keyed on the `WebGLTexture` handle rather than the user-side
  // `Texture`, so a releaseGpu / re-upload cycle — which hands the same
  // `Texture` a brand new handle — can never match a stale slot. A hole
  // (`undefined`) means "unit never touched", which reads as a miss and binds.
  private readonly _boundHandles: Array<WebGLTexture | null> = [];
  private _textureUnit = 0;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _clearColor: Color = new Color();
  private _boundFramebuffer: WebGLFramebuffer | null = null;
  private readonly _stats: RenderStats = createRenderStats();
  private readonly _accountant: GpuResourceAccountant = new GpuResourceAccountant(this._stats);
  private readonly _transformBuffer = new TransformBuffer();
  /**
   * Live persistent slot stores, so a device loss can invalidate every one of
   * them — their textures and buffers belong to the context that just went away.
   */
  private readonly _persistentStores = new Set<WebGl2PersistentSlotStore>();
  private _transformTexture: DataTexture<TextureFormat.Rgba32F> | null = null;
  // Row -> texel mapping for the current buffer capacity, plus the scratch rects
  // the per-flush upload writes its regions into (both paths run every flush, so
  // neither allocates).
  private _transformTextureLayout: TransformTextureLayout | null = null;
  private readonly _transformRectScratch = createTransformTextureRect();
  private readonly _tintRectScratch = createTransformTextureRect();
  private _transformTextureHash = 0;
  private _transformTextureCount = -1;
  // Tint's own rgba8 texture (see TransformBuffer's class doc for why it's
  // split out of the fp32 transform texture): created/uploaded alongside the
  // transform texture in bindTransformBufferTexture (same dirty-range
  // consumption), bound separately by renderers that read tint.
  private _tintTexture: DataTexture<TextureFormat.Rgba8> | null = null;
  private _activeDrawCommand: DrawCommand | null = null;
  private _drawPlanDepth = 0;
  // Nested-plan stacks, indexed by `_drawPlanDepth` rather than push/pop-drained:
  // the depth already IS the stack cursor, and a drained array gives its backing
  // store back only to re-grow it on the next `render()` call.
  private readonly _planBaseStack: number[] = [];
  private readonly _planHashStack: number[] = [];
  private _renderPlanEpoch = 0;
  // Retained instruction-set capture state.
  private readonly _retainedCaptures: RetainedCaptureFrame[] = [];
  private readonly _retainedBundles = new Set<WebGl2RetainedGroupResources>();
  // Reused scratch for the capture-end node-index scan (record frames only).
  private readonly _retainedIndexRange: WebGl2RetainedNodeIndexRange = { min: 0, max: -1 };

  public constructor(app: Application) {
    const canvasOptions = app.options.canvas ?? {};
    const renderingOptions = app.options.rendering ?? {};
    const width = canvasOptions.width ?? 800;
    const height = canvasOptions.height ?? 600;
    const clearColor = app.options.clearColor;
    const webglAttributes = renderingOptions.webglAttributes;
    const alphaMode = renderingOptions.alphaMode ?? 'opaque';
    const debug = renderingOptions.debug ?? false;
    this._surfacePixelRatio = sanitizeSurfacePixelRatio(canvasOptions.pixelRatio);
    this._canvas = app.canvas;

    const gl = this._createContext(webglAttributes, alphaMode);

    if (!gl) {
      throw new Error('This browser or hardware does not support WebGL.');
    }

    this._context = __DEV__ && debug ? makeWebGl2DebugContext(gl) : gl;
    this._contextLost = this._context.isContextLost();

    // Enable + cache float color-buffer renderability. getExtension() is the
    // enable call; without it, RGBA16F/RGBA32F are not color-renderable in WebGL2.
    this._floatRenderable = this._context.getExtension('EXT_color_buffer_float') !== null;
    this._maxTextureSize = this._context.getParameter(this._context.MAX_TEXTURE_SIZE) as number;

    // Grab the lose-context extension up front so a later restore can act on the
    // live instance (see the field comment). `null` on backends that don't
    // expose it — the recovery path then simply relies on the browser's own
    // automatic restoration.
    this._loseContextExtension = this._context.getExtension('WEBGL_lose_context');

    if (this._contextLost) {
      this._restoreContext();
    }

    if (clearColor) {
      this.clearColor.copy(clearColor);
    }

    this._rootRenderTarget = new RenderTarget(width, height, true);
    this._renderTarget = this._rootRenderTarget;

    this._onContextLostHandler = this._onContextLost.bind(this);
    this._onContextRestoredHandler = this._onContextRestored.bind(this);

    this._setupContext();
    this._addEvents();

    // Core renderers are bound via buildCoreRendererBindings in Application.createBackend.
    // Connect the registry now so newly bound renderers are immediately connected.
    this.rendererRegistry.connect(this);

    this._bindRenderTarget(this._renderTarget);
    this.setBlendMode(BlendModes.Normal);

    this.resize(width, height);
  }

  public get context(): WebGL2RenderingContext {
    return this._context;
  }

  public get renderTarget(): RenderTarget {
    return this._renderTarget;
  }

  public get view(): View {
    return this._renderTarget.view;
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
   * Deliberately NOT {@link rootResolution}, even though the two agree in every
   * ordinary sizing mode. This is the number a rasterizer keys a cache on, and
   * it has to be stable and quantized to be safe there: under `'letterbox'`
   * sizing the root target stays at the design size while the backing store
   * tracks the parent's fitted rectangle, so `rootResolution` is an arbitrary
   * float that moves on every window resize - keying a glyph atlas on it would
   * mint a fresh set of pages per resize step.
   */
  public get surfacePixelRatio(): number {
    return this._surfacePixelRatio;
  }

  public get maxTextureSize(): number {
    return this._maxTextureSize;
  }

  public get clearColor(): Color {
    return this._clearColor;
  }

  public get stats(): RenderStats {
    return this._stats;
  }

  /**
   * Per-backend GPU resource accountant (VRAM / upload / download bookkeeping).
   * Used by this backend's renderers (e.g. batched vertex/index buffers) to
   * book their own allocations and uploads. Not part of any public surface.
   * @internal
   */
  public get accountant(): GpuResourceAccountant {
    return this._accountant;
  }

  /** @internal */
  public get activeDrawCommand(): DrawCommand | null {
    return this._activeDrawCommand;
  }

  /**
   * Internal render-pass coordinator. Owns target / view / clear orchestration
   * and the scissor / stencil-clip stacks for this backend; not part of the
   * public {@link RenderBackend} surface.
   * @internal
   */
  public get _passCoordinator(): WebGl2PassCoordinator {
    return (this._passCoordinatorInstance ??= new WebGl2PassCoordinator(this));
  }

  public async initialize(): Promise<this> {
    return this;
  }

  public resetStats(): this {
    resetRenderStats(this._stats);
    // The transform buffer is frame-scoped: reset it once per frame here (was
    // previously reset per render() call in _beginDrawPlan).
    this._transformBuffer.begin();

    return this;
  }

  /** Frame-global slot base the plan builder indexes from. @internal */
  public get transformBufferCount(): number {
    return this._transformBuffer.count;
  }

  /** Monotonic render-plan token for per-material replay deduplication. @internal */
  public get renderPlanEpoch(): number {
    return this._renderPlanEpoch;
  }

  /** @internal */
  public _beginDrawPlan(_nodeCount: number): void {
    this._renderPlanEpoch++;
    // Do NOT reset the transform buffer here — it is frame-scoped (reset in
    // resetStats). The builder already based this plan's node indices at the
    // current buffer count, so writes land in fresh frame-global slots and
    // batches survive across render() calls. Remember this plan's base so a
    // nested plan can free its rows on end.
    const depth = this._drawPlanDepth;

    if (depth < this._planBaseStack.length) {
      this._planBaseStack[depth] = this._transformBuffer.count;
      this._planHashStack[depth] = this._transformBuffer.frameHash;
    } else {
      this._planBaseStack.push(this._transformBuffer.count);
      this._planHashStack.push(this._transformBuffer.frameHash);
    }

    this._activeDrawCommand = null;
    this._drawPlanDepth++;
  }

  /** @internal */
  public _prepareRenderGroupUpload(entries: readonly ScopeEntry[], startIndex: number, count: number): void {
    // Pack the whole render group's world transforms (+ tint) into the shared
    // transform buffer at the group's upload boundary, keyed by each draw
    // command's stable nodeIndex. Every draw the player will submit for this
    // group is covered here, before the group's first draw — so the per-draw
    // write previously done in `_prepareDrawCommand` is no longer needed and
    // the buffer is filled one contiguous group slice at a time.
    //
    // The group is the entries range `[startIndex, startIndex + count)`; every
    // entry in it is a draw, so the player no longer materializes a group array.
    //
    // Renderers that pack their own per-node data (Text, Particle) never read
    // the shared buffer, so their commands are skipped — no consuming draw ever
    // references their slots (nodeIndex is unique per command).
    const end = startIndex + count;

    for (let i = startIndex; i < end; i++) {
      const entry = entries[i]!;

      // Every entry in a group run is a draw; narrow to read its command.
      if (entry.kind !== RenderEntryKind.Draw) {
        continue;
      }

      const command = entry.command;

      if (drawCommandUsesSharedTransform(command, this)) {
        this._writeTransformCommand(command);
      } else {
        this._transformBuffer.recordSkippedWrite();
      }
    }
  }

  /**
   * Allocate a persistent slot store for `source`, or refuse it.
   *
   * The backend's own check is narrow: every item in the source must resolve to
   * ONE renderer, and that renderer must implement the indexed path. Everything
   * beyond that — materials, blend modes, the texture table — is the renderer's
   * rule, so the decision is delegated rather than duplicated here.
   *
   * Called once per built source. A refusal is remembered by the caller, so the
   * walk below never runs per frame.
   * @internal
   */
  public _acquirePersistentSlots(source: RenderRootSource): PersistentSlotBundle | null {
    let owner: PersistentSlotCapableRenderer | null = null;

    for (const scope of source.scopes) {
      const drawables = scope.items.drawables;
      const count = scope.items.count;

      for (let i = 0; i < count; i++) {
        let renderer: PersistentSlotCapableRenderer | null;

        try {
          renderer = this.rendererRegistry.resolve(drawables[i]!) as unknown as PersistentSlotCapableRenderer | null;
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
    const store = bundle as WebGl2PersistentSlotStore;

    store.owner?._writePersistentSlotRows(store, source, entered, count);
  }

  /** @internal */
  public _drawPersistentOrder(bundle: PersistentSlotBundle, order: Uint32Array, count: number): void {
    const store = bundle as WebGl2PersistentSlotStore;

    store.owner?._drawPersistentSlots(store, order, count, this);
  }

  /** @internal */
  public _prepareDrawCommand(command: DrawCommand): void {
    // Transform packing now happens at the render-group upload boundary
    // (`_prepareRenderGroupUpload`); this hook only tracks the active draw so
    // the mesh renderer can read the current command's nodeIndex.
    this._activeDrawCommand = command;
  }

  /**
   * Write a single draw command's world transform (+ tint) into the shared
   * transform buffer at its `nodeIndex` slot. Used for draws that do not arrive
   * through a render-group upload boundary — currently the mesh renderer's
   * synthetic, non-plan instanced path.
   * @internal
   */
  public _writeTransformCommand(command: DrawCommand): void {
    const drawable = command.drawable;

    // Upload the RAW global transform: WebGL2 position snapping now happens in
    // the vertex shaders (the row's snap-mode flag at texel 1's `.z` tells them
    // whether to snap the device origin), so the CPU seam no longer rounds the
    // translation. Geometry-boundary snapping still composes on the CPU.
    this._transformBuffer.write(command.nodeIndex, drawable.getGlobalTransform(), drawable.tint, drawable.pixelSnapMode);
  }

  /**
   * Device-pixel viewport rect last applied via `gl.viewport` — origin `(x, y)`
   * and size `(width, height)` in actual framebuffer pixels (GL bottom-left
   * origin). The core vertex shaders read this (as `u_viewport`) to project a
   * drawable's clip-space origin into device pixels for GPU-side position
   * snapping. Because the rect is whole device pixels, grid alignment is
   * independent of the y-flip convention.
   * @internal
   */
  public get _snapViewport(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    return this._deviceViewport;
  }

  /**
   * Stage the device-pixel viewport rect into `shader`'s `u_viewport` uniform
   * (a no-op when the program doesn't declare it). Staged unconditionally per
   * flush alongside `u_group` — a vec4 uniform set is cheap — so every core
   * vertex shader can snap a drawable's device origin whenever its transform-row
   * flag is set.
   * @internal
   */
  public _stageViewportUniform(shader: Shader): void {
    if (!shader.uniforms.has('u_viewport')) {
      return;
    }

    const viewport = this._deviceViewport;
    const scratch = this._viewportUniformScratch;

    scratch[0] = viewport.x;
    scratch[1] = viewport.y;
    scratch[2] = viewport.width;
    scratch[3] = viewport.height;

    shader.getUniform('u_viewport').setValue(scratch);
  }

  /**
   * Append a drawable's world transform (+ tint) to the shared transform buffer
   * and return the slot it was written to. Used by instanced renderers for draws
   * that arrive without a render-group upload boundary — i.e. a direct
   * `backend.draw(drawable)` outside the plan player (`activeDrawCommand === null`),
   * where no stable `nodeIndex` was assigned. Unlike {@link _writeTransformCommand}
   * (fixed slot) this allocates a fresh slot, so a batch of synthetic draws does
   * not collide on a single row.
   * @internal
   */
  public _pushTransform(drawable: Drawable): number {
    // Raw global transform — the vertex shaders snap the origin (see
    // {@link _writeTransformCommand}).
    return this._transformBuffer.push(drawable.getGlobalTransform(), drawable.tint, drawable.pixelSnapMode);
  }

  /** @internal */
  public _endDrawPlan(): void {
    this._activeDrawCommand = null;

    const depth = this._drawPlanDepth - 1;
    const planBase = depth >= 0 ? (this._planBaseStack[depth] ?? 0) : 0;
    const planHash = depth >= 0 ? (this._planHashStack[depth] ?? 0) : 0;

    if (this._drawPlanDepth > 0) {
      this._drawPlanDepth--;
    }

    // A nested plan (filter / cacheAsTexture) just ended: flush its draws, then
    // free its transform rows so the frame-scoped buffer only grows with
    // top-level render() calls. Top-level plans (depth back to 0) keep their rows
    // so cross-call batching survives to the frame-end flush.
    if (this._drawPlanDepth > 0) {
      this._flushActiveRenderer();
      this._transformBuffer.rewindTo(planBase, planHash);
    }

    // Only assert balance at the outermost plan.
    if (this._drawPlanDepth === 0) {
      this._assertBalancedStencil();
    }
  }

  private _assertBalancedStencil(): void {
    let unpopped = 0;

    for (const state of this._stencilStates.values()) {
      unpopped += state.stack.length;
    }

    if (unpopped === 0) {
      return;
    }

    // Reset so a leaked clip cannot corrupt subsequent frames, then surface it.
    for (const state of this._stencilStates.values()) {
      state.depth = 0;
      state.stack.length = 0;
    }

    const gl = this._context;

    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.disable(gl.STENCIL_TEST);

    throw new Error(`Unbalanced stencil clip stack at end of frame (${unpopped} unpopped clip(s)).`);
  }

  public draw(drawable: Drawable): this {
    const renderer = this.rendererRegistry.resolve(drawable);

    // Belt-and-braces for retained recording: the recordability
    // predicate keeps non-capable renderers from ever arming a capture. If
    // one still draws inside an open capture window, poison the recording so
    // the set never validates — entry replay instead of missing draws.
    if (this._retainedCaptures.length > 0 && (renderer as RetainedBatchCapableRenderer)._supportsRetainedBatches !== true) {
      this._poisonRetainedCaptures();
    }

    this._setActiveRenderer(renderer);
    renderer.render(drawable);
    this._activeDrawCommand = null;
    this._stats.submittedNodes++;

    return this;
  }

  public drawInstanced(mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number, instances: InstanceDataView | null = null): this {
    if (count <= 0 || mesh.vertexCount === 0) {
      return this;
    }

    if (transforms.length < count || tints.length < count) {
      throw new Error(`drawInstanced requires ${count} transforms and tints (got ${transforms.length}/${tints.length}).`);
    }

    const renderer = this.rendererRegistry.resolve(mesh);

    if (!(renderer instanceof WebGl2MeshRenderer)) {
      throw new Error('drawInstanced requires a mesh handled by the WebGL2 mesh renderer.');
    }

    this._setActiveRenderer(renderer);

    // Write each instance's (transform, tint) into a fresh, contiguous transform
    // slot — before the renderer's draw uploads the buffer (write-before-bind) —
    // then draw the geometry once over [startNodeIndex, startNodeIndex + count).
    // In-bounds: `i < count <= transforms.length` and `<= tints.length` (guarded above).
    const startNodeIndex = this._transformBuffer.push(transforms[0]!, tints[0]!);

    for (let i = 1; i < count; i++) {
      this._transformBuffer.push(transforms[i]!, tints[i]!);
    }

    renderer.drawInstancedBatch(mesh, startNodeIndex, count, instances);
    this._activeDrawCommand = null;
    this._stats.submittedNodes += count;

    return this;
  }

  public execute(pass: BackendRenderPass): this {
    this._flushActiveRenderer();
    this._stats.renderPasses++;
    pass.execute(this);

    return this;
  }

  public setRenderTarget(target: RenderTarget | null): this {
    const renderTarget = target || this._rootRenderTarget;

    assertLiveRenderTarget(renderTarget);

    const changed = this._renderTarget !== renderTarget;

    if (changed) {
      this._flushActiveRenderer();
      this._renderTarget = renderTarget;
      this._stats.renderTargetChanges++;
    }

    this._bindRenderTarget(renderTarget);

    if (changed) {
      // Stencil state is per-target: restore the new target's clip depth so an
      // outer clip on the previous target does not leak onto this one.
      this._applyStencilState(renderTarget);
    }

    return this;
  }

  public pushScissorRect(bounds: Rectangle): this {
    this._flushActiveRenderer();

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
    this._applyClipState();

    return this;
  }

  public popScissorRect(): this {
    if (this._clipDepth === 0) {
      return this;
    }

    this._flushActiveRenderer();

    this._clipDepth--;
    this._applyClipState();

    return this;
  }

  public pushStencilClip(shape: Geometry, transform: Matrix): this {
    const target = this._renderTarget;
    const state = this._getStencilState(target);

    if (state.depth >= 255) {
      throw new Error('Stencil clip nesting exceeds the 255-level limit.');
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._stencilClipperConnected) {
      this._stencilClipper.connect(this);
      this._stencilClipperConnected = true;
    }

    const gl = this._context;
    const depth = state.depth;

    if (depth === 0) {
      this._ensureTargetStencil();
      gl.enable(gl.STENCIL_TEST);

      // Clear the whole stencil buffer to 0 regardless of any active scissor,
      // then restore the scissor state for the shape/content draws.
      gl.disable(gl.SCISSOR_TEST);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      this._applyClipState();
    }

    // Increment the stencil where the shape covers the already-valid region
    // (EQUAL depth). Color/depth writes off so only the stencil is touched.
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

    this._stencilClipper.draw(this, shape, transform);

    gl.colorMask(true, true, true, true);

    state.depth = depth + 1;
    state.stack.push({ shape, transform: new Matrix().copy(transform) });

    // Content now passes only where the stencil equals the new depth.
    gl.stencilFunc(gl.EQUAL, state.depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    return this;
  }

  public popStencilClip(): this {
    const target = this._renderTarget;
    const state = this._getStencilState(target);
    const entry = state.stack.pop();

    if (entry === undefined) {
      return this;
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    const gl = this._context;
    const depth = state.depth;

    // Decrement the region this clip incremented, restoring the outer level.
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);

    this._stencilClipper.draw(this, entry.shape, entry.transform);

    gl.colorMask(true, true, true, true);

    state.depth = depth - 1;
    this._applyStencilState(target);

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
    if (width <= 0 || height <= 0) {
      return this;
    }

    // Flush any in-progress drawable batch so the compositor draws on
    // top of fully-committed render state, not in the middle of a batch.
    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._maskCompositorConnected) {
      this._maskCompositor.connect(this);
      this._maskCompositorConnected = true;
    }

    this._maskCompositor.compose(this, content, mask, x, y, width, height, blendMode);

    return this;
  }

  public composeWithBackdropBlend(source: RenderTexture, x: number, y: number, width: number, height: number, mode: BlendModes): this {
    if (width <= 0 || height <= 0) {
      return this;
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._backdropBlendCompositorConnected) {
      this._backdropBlendCompositor.connect(this);
      this._backdropBlendCompositorConnected = true;
    }

    this._backdropBlendCompositor.compose(this, source, x, y, width, height, mode);

    return this;
  }

  /**
   * Return the GL framebuffer for `target`, preparing the render-target state so
   * the texture is attached. Used internally by {@link WebGl2BackdropBlendCompositor}
   * for framebuffer blits. Null for the root (default) framebuffer.
   * @internal
   */
  public _renderTargetFramebuffer(target: RenderTarget): WebGLFramebuffer | null {
    return this._prepareRenderTarget(target).framebuffer;
  }

  /**
   * Re-bind the currently active render target as the GL DRAW framebuffer and
   * restore the viewport. Called by {@link WebGl2BackdropBlendCompositor} after
   * it unbinds the framebuffer for a blit operation.
   * @internal
   */
  public _rebindActiveTarget(): void {
    this._bindRenderTarget(this._renderTarget);
  }

  /**
   * Whether a {@link RenderTexture} of this color format can be rendered into
   * on this context. `'rgba8'` is always supported; the float formats require
   * the `EXT_color_buffer_float` WebGL2 extension. Callers should check this
   * before allocating a float target and fall back to `'rgba8'` themselves.
   */
  public supportsColorFormat(format: ColorTextureFormat): boolean {
    return format === TextureFormat.Rgba8 || this._floatRenderable;
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
      this._flushActiveRenderer();
    }
    this._renderTarget.setView(view);
    this._bindRenderTarget(this._renderTarget);

    return this;
  }

  public bindVertexArrayObject(vao: WebGl2VertexArrayObject | null): this {
    if (this._vao !== vao) {
      if (vao) {
        // Binding a VAO implicitly replaces the previous binding. Only when
        // switching to "no VAO" do we explicitly unbind — unbinding the old VAO
        // *after* binding the new one would leave the GL default (null) VAO
        // bound and silently break the next draw (a renderer/clip VAO switch).
        vao.bind();
      } else {
        this._vao?.unbind();
      }

      this._vao = vao;
    }

    return this;
  }

  public bindShader(shader: Shader | null): this {
    if (this._shader !== shader) {
      if (this._shader) {
        this._shader.unbind();
        this._shader = null;
      }

      if (shader) {
        shader.bind();
      }

      this._shader = shader;
    }

    return this;
  }

  public bindTexture(texture: Texture | RenderTexture | null, unit?: number): this {
    if (unit !== undefined) {
      this._setTextureUnit(unit);
    }

    if (texture === null) {
      this._bindTextureHandle(null);

      return this;
    }

    // `_syncTexture` performs the bind itself (through the same per-unit cache)
    // because its parameter and upload calls act on whatever is bound to the
    // active unit — binding a second time here would only duplicate GL work.
    this._syncTexture(texture);

    return this;
  }

  /** Bind a material's base-texture sampler override to one texture unit. @internal */
  public bindMaterialSampler(options: SamplerOptions, unit: number): this {
    const key = samplerStateKey(options.scaleMode, options.wrapMode);
    let sampler = this._materialSamplers.get(key);

    if (sampler === undefined) {
      const gl = this._context;
      const created = gl.createSampler();

      if (created === null) {
        throw new Error('WebGl2Backend: could not create a material sampler.');
      }

      gl.samplerParameteri(created, gl.TEXTURE_MAG_FILTER, options.scaleMode);
      gl.samplerParameteri(created, gl.TEXTURE_MIN_FILTER, options.scaleMode);
      gl.samplerParameteri(created, gl.TEXTURE_WRAP_S, options.wrapMode);
      gl.samplerParameteri(created, gl.TEXTURE_WRAP_T, options.wrapMode);
      this._materialSamplers.set(key, created);
      sampler = created;
    }

    this._context.bindSampler(unit, sampler);

    return this;
  }

  /** Restore a texture unit to its texture-owned sampler state. @internal */
  public unbindMaterialSampler(unit: number): this {
    this._context.bindSampler(unit, null);

    return this;
  }

  /**
   * Make `unit` the active texture unit through the backend's unit cache.
   *
   * Renderers that bind a *raw* `WebGLTexture` to a unit (e.g. the text
   * renderer's private node-data texture) must route the unit switch through
   * here instead of calling `gl.activeTexture` directly — otherwise the cache
   * goes stale and a later {@link bindTexture} can skip its own `activeTexture`
   * call, binding to the wrong unit. Bind the handle itself with
   * {@link bindRawTexture} rather than `gl.bindTexture`, so the per-unit bind
   * cache keeps mirroring GL.
   * @internal
   */
  public setActiveTextureUnit(unit: number): this {
    this._setTextureUnit(unit);

    return this;
  }

  /**
   * Bind a raw `WebGLTexture` (or `null`) to the active texture unit through
   * the backend's per-unit bind cache.
   *
   * For renderer-private handles that have no user-side {@link Texture} — the
   * text renderer's node-data texture is the only one today. Going through here
   * instead of `gl.bindTexture` keeps the cache coherent: the backend both
   * skips a redundant re-bind of this handle and still re-binds when a managed
   * texture has to take the unit back.
   *
   * A raw handle deleted behind the cache's back needs no notification: GL
   * unbinds it everywhere, and a deleted `WebGLTexture` can never be handed out
   * again, so a slot still naming it can only ever cost one redundant bind —
   * never suppress a needed one.
   * @internal
   */
  public bindRawTexture(handle: WebGLTexture | null): this {
    this._bindTextureHandle(handle);

    return this;
  }

  /** @internal */
  public bindTransformBufferTexture(unit: number, minCount: number): this {
    const requiredCount = Math.max(1, minCount);
    const transformTexture = this._transformTexture;
    // Rows are packed several per texture line, so a row index is not the y
    // coordinate: the store scales to `rowsPerLine * MAX_TEXTURE_SIZE` rows
    // instead of stopping dead at MAX_TEXTURE_SIZE. Throws (rather than
    // rendering black off an incomplete texture) if even that is exceeded.
    // Rebuilt only when the buffer's capacity changes — this runs per flush.
    let layout = this._transformTextureLayout;

    if (layout?.rowCapacity !== this._transformBuffer.capacity) {
      layout = createTransformTextureLayout(this._transformBuffer.capacity, this._maxTextureSize);
      this._transformTextureLayout = layout;
    }

    if (
      transformTexture?.height !== layout.transformHeight ||
      transformTexture.width !== layout.transformWidth ||
      transformTexture.buffer !== this._transformBuffer.data
    ) {
      transformTexture?.destroy();

      this._transformTexture = new DataTexture({
        width: layout.transformWidth,
        height: layout.transformHeight,
        format: TextureFormat.Rgba32F,
        data: this._transformBuffer.data,
      });
      this._transformTextureHash = 0;
      this._transformTextureCount = -1;
    }

    // Tint's capacity always grows in lockstep with the transform buffer (see
    // TransformBuffer._ensureCapacity), so the same capacity check catches
    // both a first bind and a growth — no separate dirty-hash tracking needed;
    // both textures upload from the one dirty-range consumption below.
    const tintTexture = this._tintTexture;

    if (tintTexture?.height !== layout.tintHeight || tintTexture.width !== layout.tintWidth || tintTexture.buffer !== this._transformBuffer.tintData) {
      tintTexture?.destroy();

      this._tintTexture = new DataTexture({
        width: layout.tintWidth,
        height: layout.tintHeight,
        format: TextureFormat.Rgba8,
        data: this._transformBuffer.tintData,
      });
    }

    const snapshot = this._transformBuffer.commitSnapshot(requiredCount);
    const nextTransformTexture = this._transformTexture;
    const nextTintTexture = this._tintTexture;

    if (nextTransformTexture === null || nextTintTexture === null) {
      throw new Error('Transform texture must be initialized before binding.');
    }

    // A skipped flush (all three guards false) leaves the dirty range uncleared
    // until the next begin(). Safe: every write() mixes its slot into _frameHash,
    // so a non-empty dirty range always coincides with snapshot.changed = true —
    // the upload branch is always taken before any dirty rows could be stale.
    if (snapshot.changed || snapshot.count !== this._transformTextureCount || snapshot.hash !== this._transformTextureHash) {
      // Upload only the rows actually written since the last upload (delta), so
      // barrier-heavy frames don't re-upload the whole growing buffer. A reused
      // slot below the high-water mark is in the dirty range, so it re-uploads.
      // Single consumption feeds BOTH textures — consumeDirtyRange clears the
      // range as a side effect, so it must only be called once per flush.
      const { firstRow, rowCount } = this._transformBuffer.consumeDirtyRange(snapshot.count);

      if (rowCount > 0) {
        // A logical row range maps to a texel rect, not a band of texture rows:
        // a range inside one texture line uploads exactly its texels, and one
        // that spans lines widens to whole lines so the upload keeps the
        // contiguous full-width fast path.
        const transformRect = transformTextureRect(layout, firstRow, rowCount, this._transformRectScratch);
        const tintRect = tintTextureRect(layout, firstRow, rowCount, this._tintRectScratch);

        nextTransformTexture.commitRect(transformRect.x, transformRect.y, transformRect.width, transformRect.height);
        nextTintTexture.commitRect(tintRect.x, tintRect.y, tintRect.width, tintRect.height);
        this._transformBuffer.recordUpload(rowCount);
      }

      this._transformTextureCount = snapshot.count;
      this._transformTextureHash = snapshot.hash;
    }

    return this.bindTexture(nextTransformTexture, unit);
  }

  /**
   * Bind the tint texture (uploaded as part of {@link bindTransformBufferTexture},
   * which must be called first this flush) to `unit`. Only renderers that read
   * per-node tint from the shared buffer (sprite, mesh) call this.
   * @internal
   */
  public bindTintBufferTexture(unit: number): this {
    const tintTexture = this._tintTexture;

    if (tintTexture === null) {
      throw new Error('Tint texture must be initialized (via bindTransformBufferTexture) before binding.');
    }

    return this.bindTexture(tintTexture, unit);
  }

  public setBlendMode(blendMode: BlendModes | null): this {
    if (blendMode !== this._blendMode) {
      const gl = this._context;

      this._blendMode = blendMode;

      switch (blendMode) {
        case BlendModes.Additive:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          break;
        case BlendModes.Subtract:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
          break;
        case BlendModes.Multiply:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
          break;
        case BlendModes.Screen:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
          break;
        default:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          break;
      }
    }

    return this;
  }

  private _setTextureUnit(unit: number): void {
    if (this._textureUnit !== unit) {
      const gl = this._context;

      this._textureUnit = unit;

      gl.activeTexture(gl.TEXTURE0 + unit);
    }
  }

  /**
   * Bind `handle` to the active texture unit, skipping the call when GL already
   * has it there. Per-unit rather than global: the same handle legitimately
   * occupies several units at once (batched sprite slots), so a single
   * last-bound slot would either miss those binds or suppress needed ones.
   */
  private _bindTextureHandle(handle: WebGLTexture | null): void {
    const unit = this._textureUnit;

    if (this._boundHandles[unit] === handle) {
      return;
    }

    this._context.bindTexture(this._context.TEXTURE_2D, handle);
    this._boundHandles[unit] = handle;
  }

  /**
   * Drop every cached binding of `handle`. Deleting a texture unbinds it from
   * every unit of the current context (GL spec), so the cache has to follow
   * without issuing any GL call of its own.
   */
  private _forgetTextureHandle(handle: WebGLTexture): void {
    const boundHandles = this._boundHandles;

    for (let unit = 0; unit < boundHandles.length; unit++) {
      if (boundHandles[unit] === handle) {
        boundHandles[unit] = null;
      }
    }
  }

  public setClearColor(color: Color): this {
    if (!this._clearColor.equals(color)) {
      const gl = this._context;

      this._clearColor.copy(color);

      gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    return this;
  }

  public clear(color?: Color): this {
    const gl = this._context;

    if (color) {
      this.setClearColor(color);
    }

    this._bindRenderTarget(this._renderTarget);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return this;
  }

  public resize(width: number, height: number): this {
    this._rootRenderTarget.resize(width, height);
    this._bindRenderTarget(this._renderTarget);

    return this;
  }

  public flush(): this {
    this._flushActiveRenderer();

    return this;
  }

  /**
   * Active per-group transform for the draws submitted until the next call.
   * `null` means identity (no retained group).
   * Renderers fold it into their vertex stage as `u_group`.
   * @internal
   */
  public get renderGroupTransform(): Matrix | null {
    return this._renderGroupTransform;
  }

  /**
   * Monotonic stamp bumped on every {@link _setRenderGroupTransform} call.
   * Renderers compare it to skip redundant `u_group` re-staging within an
   * unchanged group scope.
   * @internal
   */
  public get renderGroupTransformId(): number {
    return this._renderGroupTransformId;
  }

  /**
   * Playback hook (RenderPlanPlayer): enter/leave a retained transform group.
   * A group is a flush boundary by design — the pending batch must
   * drain under the OLD group matrix before the new one takes effect.
   * @internal
   */
  public _setRenderGroupTransform(transform: Matrix | null): void {
    this._flushActiveRenderer();
    this._renderGroupTransform = transform;
    this._renderGroupTransformId++;
  }

  // ── Retained instruction-set hooks ────────────────────────────────────────

  /**
   * Whether at least one retained-capture window is open. Read by capable
   * renderers at flush time to hand their packed batch to
   * {@link _recordRetainedBatch}, and at render time for the belt-and-braces
   * poison checks.
   * @internal
   */
  public get _isRetainedCapturing(): boolean {
    return this._retainedCaptures.length > 0;
  }

  /**
   * The innermost open capture's group bundle, or `null` when no capture is
   * open. A renderer that stores its own per-bundle replay state (Text) keys a
   * "already recorded a batch into this window" guard on it, so a second flush
   * into the same window poisons instead of overwriting the first batch's
   * group-owned resources.
   * @internal
   */
  public get _currentRetainedCaptureBundle(): WebGl2RetainedGroupResources | null {
    const captures = this._retainedCaptures;

    return captures.length > 0 ? captures[captures.length - 1]!.bundle : null;
  }

  /**
   * Playback hook (RenderPlanPlayer): a retained group scope starts
   * recording. The pending live batch is flushed first (contract: no batch
   * spans into the capture window), the set's group bundle is (re)used or
   * created, and its contents are rewritten — which bumps the generation, so
   * instructions recorded by any previous capture stop validating.
   * @internal
   */
  public _beginRetainedCapture(set: RetainedInstructionSet): void {
    this._flushActiveRenderer();

    const owned = set.ownedBundle;
    let bundle: WebGl2RetainedGroupResources;

    if (owned instanceof WebGl2RetainedGroupResources && this._retainedBundles.has(owned)) {
      bundle = owned;
    } else {
      // No bundle yet, or one owned by a different backend instance (backend
      // switch): start fresh. The stale bundle stays owned by its backend and
      // is released by that backend's destroy().
      bundle = new WebGl2RetainedGroupResources(destroyed => this._retainedBundles.delete(destroyed));
      this._retainedBundles.add(bundle);
      set.ownedBundle = bundle;
    }

    bundle._beginCapture();
    this._retainedCaptures.push({ set, bundle, payloads: [], instructions: [] });
  }

  /**
   * Playback hook (RenderPlanPlayer): the recording scope's playback ended.
   * The pending batch flushes INTO the still-open captures (the group's
   * trailing draws belong to the set), then this frame finalizes: node
   * indices in the recorded bytes are rebased group-local, the
   * group's shared-buffer transform rows are copied into the group-owned
   * store, the instance bytes upload into the persistent buffer, and each
   * batch gets its offset-based VAO.
   * @internal
   */
  public _endRetainedCapture(set: RetainedInstructionSet): void {
    this._flushActiveRenderer();

    let index = this._retainedCaptures.length - 1;

    while (index >= 0 && this._retainedCaptures[index]!.set !== set) {
      index--;
    }

    if (index === -1) {
      return;
    }

    // In-bounds: found above.
    const frame = this._retainedCaptures.splice(index, 1)[0]!;

    if (frame.payloads.length === 0) {
      return;
    }

    if (this._contextLost) {
      // GPU finalize is impossible; make sure the set can never validate.
      frame.set.append(this._createPoisonInstruction(frame.bundle));

      return;
    }

    const range = this._retainedIndexRange;

    range.min = Number.MAX_SAFE_INTEGER;
    range.max = -1;

    for (const payload of frame.payloads) {
      payload.replayer._scanRetainedNodeIndexRange(payload, range);
    }

    // A group whose every recorded batch opts out of the shared transform
    // buffer (Text bakes world positions into its own instance bytes and reads
    // its style from a private per-node texture — `_consumesSharedTransform ===
    // false`) leaves the range empty: there is nothing to rebase or store, but
    // the instance bytes and per-batch VAOs still need finalizing below.
    // Connect first: the group's transform store sizes its textures against the
    // context's MAX_TEXTURE_SIZE, which it can only read once attached.
    frame.bundle._connectDevice(this._context, this._accountant);

    if (range.max >= range.min) {
      for (const payload of frame.payloads) {
        payload.replayer._rebaseRetainedNodeIndices(payload, range.min);
      }

      frame.bundle._storeTransformRows(this._transformBuffer.data, this._transformBuffer.tintData, range.min, range.max - range.min + 1);
    }

    frame.bundle._uploadInstances();

    for (let i = 0; i < frame.payloads.length; i++) {
      // In-bounds: i < length.
      const payload = frame.payloads[i]!;

      payload.vao = frame.bundle._acquireVao(i);
      payload.replayer._configureRetainedVao(payload);
    }

    // Resources are final: stamp this frame's instructions with the bundle's
    // generation (official plan-layer seam). Skipped by the early returns
    // above (context loss, empty range) — unstamped instructions keep the
    // set invalid, which is exactly the wanted failure mode there.
    for (const instruction of frame.instructions) {
      stampRetainedBatchGeneration(instruction);
    }
  }

  /**
   * Record one just-drawn renderer flush into the open capture windows: the
   * instance words are copied once into the INNERMOST frame's bundle, and one
   * batch instruction referencing that bundle is appended to EVERY open
   * frame's set (outer sets hold inner bundles' batches verbatim).
   * Called by capable renderers from `flush()` while a capture is open.
   *
   * `nodeCount` is the batch's `stats.submittedNodes` contribution and defaults
   * to `instanceCount` (one instance is one node). A renderer whose node expands
   * into several instances must pass its own count - see
   * {@link RetainedBatchInstruction.nodeCount}. It is the LAST parameter on
   * purpose: inserting it next to `instanceCount` would silently shift the
   * existing optional trailing arguments at every cross-package call site.
   * @internal
   */
  public _recordRetainedBatch(
    replayer: WebGl2RetainedBatchReplayer,
    words: Uint32Array,
    instanceCount: number,
    blendMode: BlendModes,
    textures: ReadonlyArray<Texture | RenderTexture | null>,
    textureCount: number,
    geometry: WebGl2RetainedGeometryRef | null = null,
    rendererData: unknown = null,
    nodeCount: number = instanceCount,
  ): void {
    const captures = this._retainedCaptures;

    if (captures.length === 0) {
      return;
    }

    // In-bounds: length > 0.
    const innermost = captures[captures.length - 1]!;
    const byteOffset = innermost.bundle._appendInstanceWords(words);
    const boundTextures: Array<Texture | RenderTexture> = [];
    const recordedTextureState: WebGl2RecordedTextureState[] = [];

    for (let i = 0; i < textureCount; i++) {
      // Non-null: slots `0..textureCount-1` are the renderer's bound textures.
      const texture = textures[i]!;

      boundTextures.push(texture);
      // Record-time size/flipY: the packed UV words are normalized against
      // these, so collect-time validation must reject the batch when they
      // move (see _validateRetainedInstructionSet).
      recordedTextureState.push({ width: texture.width, height: texture.height, flipY: texture.flipY });
    }

    const payload: WebGl2RetainedBatchPayload = {
      bundle: innermost.bundle,
      replayer,
      blendMode,
      textures: boundTextures,
      recordedTextureState,
      instanceCount,
      byteOffset,
      geometry,
      rendererData,
      vao: null,
    };

    innermost.payloads.push(payload);

    // Generation is stamped at capture end (official plan-layer seam). On
    // WebGL2 the generation is stable for the whole capture (_beginCapture
    // bumps once, growth is CPU-staged), so end-stamping yields the same
    // value — but a capture that never finalizes (context loss) now leaves
    // the sentinel behind and the set can never validate.
    const instruction: RetainedBatchInstruction = {
      kind: RetainedInstructionKind.Batch,
      bundle: innermost.bundle,
      generation: retainedGenerationUnstamped,
      instanceCount,
      nodeCount,
      drawCalls: 1,
      payload,
    };

    innermost.instructions.push(instruction);

    for (const frameEntry of captures) {
      frameEntry.set.append(instruction);
    }
  }

  /**
   * Invalidate every open capture window by appending an instruction whose
   * recorded generation can never match its bundle — the resulting sets fail
   * collect-time validation forever and the group stays on the (correct)
   * entry-replay tier.
   *
   * Most callers are belt-and-braces for draws the collect-time recordability
   * predicate already excluded, and those never fire on a healthy frame — a
   * renderer whose non-recordable draws are decidable PER DRAWABLE states that
   * through `_admitsRetainedRecording` so the capture is never opened at all
   * (mesh geometry storage, the repeating sprite's shader path).
   *
   * One caller is not defensive and DOES fire on healthy frames: the Text
   * renderer poisons when a flush is not a single recordable batch, or when a
   * SECOND Text flush lands in the same window. Neither is a property of any
   * one drawable — both depend on how the frame's draws compose into flushes —
   * so no per-drawable predicate can pre-empt them, and a perfectly ordinary
   * scene reaches this (two overlapping Text nodes split by a sprite in between
   * force two Text flushes into one window, on every frame). Such a group
   * re-records and re-poisons per frame; the tier it lands on is correct, the
   * repeated recording is the waste, and a cheaper form (a veto flag on the set
   * instead of one appended instruction per open capture) is the open follow-up.
   * @internal
   */
  public _poisonRetainedCaptures(): void {
    for (const frame of this._retainedCaptures) {
      frame.set.append(this._createPoisonInstruction(frame.bundle));
    }
  }

  private _createPoisonInstruction(bundle: WebGl2RetainedGroupResources): RetainedBatchInstruction {
    return {
      kind: RetainedInstructionKind.Batch,
      bundle,
      generation: bundle.generation - 1,
      instanceCount: 0,
      drawCalls: 0,
      payload: null,
    };
  }

  /**
   * Collect-time backend validation on top of the plan-level
   * generation check — the WebGPU view-identity guard's WebGL2 counterpart:
   * every recorded batch's textures must still have their record-time size
   * and flipY orientation. The per-instance UV words baked into the group
   * instance buffer are normalized against the record-time texture size
   * (with the flipY swap applied at pack time), and a texture resize bumps
   * only the texture VERSION — never a node revision — so the fragment stays
   * clean and replaying would sample a stale region. A failed check also
   * DROPS the recording (`set.invalidate()`, the sanctioned drop-&-re-record
   * mode), so the group entry-replays live and re-records on this same
   * frame. Same-size content updates pass: textures are re-bound and
   * re-synced live at replay, only the normalization inputs matter here.
   * @internal
   */
  public _validateRetainedInstructionSet(set: RetainedInstructionSet): boolean {
    if (this._contextLost) {
      return false;
    }

    // Indexed rather than `for…of`: the inner texture-state loop next to it is
    // already indexed for the same reason — every retained set is validated
    // once per frame, and the array iterator's per-step result object is the
    // kind of steady-state garbage a fully retained frame must not produce.
    const instructions = set.instructions;

    for (let index = 0; index < instructions.length; index++) {
      const instruction = instructions[index]!;

      if (instruction.kind !== RetainedInstructionKind.Batch) {
        continue;
      }

      const payload = instruction.payload as WebGl2RetainedBatchPayload | null;

      if (payload === null || typeof payload !== 'object' || !(payload.bundle instanceof WebGl2RetainedGroupResources)) {
        return false;
      }

      if (payload.replayer._validateRetainedBatch?.(payload) === false) {
        set.invalidate();

        return false;
      }

      const textures = payload.textures;

      for (let i = 0; i < textures.length; i++) {
        // In-bounds: i < textures.length; recordedTextureState is parallel.
        const texture = textures[i]!;
        const recorded = payload.recordedTextureState[i]!;

        if (texture.width !== recorded.width || texture.height !== recorded.height || texture.flipY !== recorded.flipY) {
          set.invalidate();

          return false;
        }
      }
    }

    return true;
  }

  /**
   * Playback hook (RenderPlanPlayer): replay one recorded batch for a spliced
   * group scope. The pending live batch drains first (in practice the group
   * boundary's transform switch already flushed it — hook contract), then the
   * owning renderer re-issues the batch from group-owned resources with all
   * state resolved live. Stats are bumped from the descriptor so the spliced
   * tier stays comparable with the entry tiers (batches / drawCalls /
   * submittedNodes parity).
   * @internal
   */
  public _replayRetainedBatch(batch: RetainedBatchInstruction): void {
    this._flushActiveRenderer();

    if (this._contextLost) {
      return;
    }

    const payload = batch.payload as WebGl2RetainedBatchPayload | null;

    if (payload === null) {
      return;
    }

    this._bindRenderTarget(this._renderTarget);
    payload.replayer._replayRetainedBatch(payload);
    this._stats.batches++;
    this._stats.drawCalls += batch.drawCalls;
    // Nodes, not instances: a batch whose renderer expands one node into many
    // instances records its own node count (see RetainedBatchInstruction).
    this._stats.submittedNodes += batch.nodeCount ?? batch.instanceCount;
  }

  public destroy(): void {
    this._destroyed = true;

    if (this._pendingRestore !== null) {
      clearTimeout(this._pendingRestore);
      this._pendingRestore = null;
    }

    this._removeEvents();
    this.onContextLost.destroy();
    this.onContextRestored.destroy();
    this.onRenderError.destroy();

    this.setRenderTarget(null);
    this._setActiveRenderer(null);
    this.bindVertexArrayObject(null);
    this.bindShader(null);
    this.bindTexture(null);

    // Release every retained group bundle created against this context.
    // Copy first: bundle.destroy() removes itself from the set.
    for (const bundle of [...this._retainedBundles]) {
      bundle.destroy();
    }

    this._retainedBundles.clear();
    this._retainedCaptures.length = 0;

    this.rendererRegistry.destroy();
    this._clearColor.destroy();
    this._destroyManagedResources();
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

    if (this._stencilClipperConnected) {
      this._stencilClipper.disconnect();
      this._stencilClipperConnected = false;
    }

    this._stencilStates.clear();
    this._drawPlanDepth = 0;
    this._rootRenderTarget.destroy();

    if (this._transformTexture !== null) {
      this._transformTexture.destroy();
      this._transformTexture = null;
    }

    if (this._tintTexture !== null) {
      this._tintTexture.destroy();
      this._tintTexture = null;
    }

    this._vao = null;
    this._renderer = null;
    this._shader = null;
    this._blendMode = null;
    this._boundHandles.length = 0;
    this._boundFramebuffer = null;
    this._activeDrawCommand = null;
    this._transformTextureCount = -1;
    this._transformTextureHash = 0;
  }

  private _createContext(options: RenderingApplicationOptions['webglAttributes'], alphaMode: CanvasAlphaMode): WebGL2RenderingContext | null {
    try {
      // Force a stencil buffer on the default framebuffer so geometric stencil
      // clipping (RenderNode.clip with a Geometry clipShape) works on the root
      // target. Inert until a clip is pushed (STENCIL_TEST stays disabled).
      // `stencil` is excluded from the public `webglAttributes` type, so
      // `options` can never smuggle a conflicting value in here.
      //
      // The two composite attributes are derived from `alphaMode`, never taken
      // from the caller's attributes, so the canvas ends up with the same
      // browser-side composite behaviour WebGPU gets from the same option.
      // `premultipliedAlpha` is unconditionally true because the engine always
      // writes premultiplied colour; with `alpha: false` the browser ignores it.
      // Both are likewise excluded from the public type for the same reason.
      return this._canvas.getContext('webgl2', {
        ...options,
        alpha: alphaMode === 'premultiplied',
        premultipliedAlpha: true,
        stencil: true,
      });
    } catch (_e) {
      return null;
    }
  }

  private _restoreContext(): void {
    // Schedule the extension-driven restore on a fresh task. A synchronous
    // `restoreContext()` call from inside the `webglcontextlost` handler is
    // silently ignored by Chromium — the browser only honours it once the lost
    // event has finished processing. Deferring is also correct for a real GPU
    // loss: `restoreContext()` only affects extension-triggered losses, so it
    // is a harmless no-op there (the browser auto-restores because we called
    // `preventDefault`). Guarded against a destroy() that lands first.
    if (this._pendingRestore !== null) {
      return;
    }

    this._pendingRestore = setTimeout(() => {
      this._pendingRestore = null;

      if (this._destroyed || !this._contextLost) {
        return;
      }

      this._loseContextExtension?.restoreContext();
    }, 0);
  }

  private _setupContext(): void {
    const gl = this._context;
    const { r, g, b, a } = this._clearColor;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);

    gl.enable(gl.BLEND);

    gl.blendEquation(gl.FUNC_ADD);
    gl.clearColor(r / 255, g / 255, b / 255, a);
  }

  private _addEvents(): void {
    this._canvas.addEventListener('webglcontextlost', this._onContextLostHandler, false);
    this._canvas.addEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
  }

  private _removeEvents(): void {
    this._canvas.removeEventListener('webglcontextlost', this._onContextLostHandler, false);
    this._canvas.removeEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
  }

  private _onContextLost(event: Event): void {
    // WebGL only fires `webglcontextrestored` if the `webglcontextlost`
    // default action is cancelled — without this the context stays dead
    // forever after a real GPU reset (mobile tab-switch, driver TDR) and the
    // canvas goes permanently blank. This is separate from the synthetic
    // `WEBGL_lose_context.restoreContext()` call below, which only drives the
    // extension-based lose/restore cycle used in tests.
    event.preventDefault();

    this._contextLost = true;
    this.onContextLost.dispatch();
    this._restoreContext();
  }

  private _onContextRestored(): void {
    this._contextLost = false;

    // Every GL object created against the lost context is dead. Evict and
    // rebuild all device-bound state before drawing resumes; otherwise the
    // caches keep dangling handles and the next frame is a blank canvas or an
    // INVALID_OPERATION storm.
    this._reinitializeDeviceState();

    this.onContextRestored.dispatch();
  }

  /**
   * Drop every device-bound GL object cached against the lost context and
   * rebuild the pieces needed to draw against the fresh one. User-facing
   * handles ({@link Texture}, {@link RenderTexture}, {@link RenderTarget})
   * keep their identity — their GPU-side state is recreated lazily on next
   * use. Mirrors the WebGPU backend's `_teardownDeviceState`.
   */
  private _reinitializeDeviceState(): void {
    const gl = this._context;

    // Re-enable the float color-buffer extension: extension enablement does
    // not survive a context loss, so RGBA16F/RGBA32F render targets would stop
    // being color-renderable until this is re-fetched on the fresh context.
    this._floatRenderable = gl.getExtension('EXT_color_buffer_float') !== null;
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // Drop the cached transform layout: it was derived from the LOST context's
    // limit, and the restored one may report a different one.
    this._transformTextureLayout = null;

    // Evict all managed texture / render-target state (deletes the now-dead
    // handles — harmless on the fresh context — frees the resource accountant,
    // and detaches destroy listeners). The maps are repopulated lazily with
    // fresh handles on next access. Clears `_stencilStates` too (each entry is
    // dropped when its render target is evicted).
    this._destroyManagedResources();

    // The shared transform (+ tint) texture handles died with the context. Drop
    // the wrappers (their GL handles were just evicted above) and reset the
    // upload bookkeeping so fresh DataTextures + a full re-upload happen on the
    // next bind.
    this._transformTexture = null;
    this._transformTextureCount = -1;
    this._transformTextureHash = 0;
    this._tintTexture = null;

    // Disconnect renderers so they release their (dead) buffers / VAOs / shader
    // programs, then reconnect to rebuild them against the fresh context. This
    // also resets each batched renderer's `appliedVersion` VAO cache.
    this.rendererRegistry.disconnect();

    // Compositors and the stencil clipper connect lazily on first use; drop
    // their dead GPU state and clear the connected flags so the next use
    // reconnects against the fresh context.
    if (this._maskCompositorConnected) {
      this._maskCompositor.disconnect();
      this._maskCompositorConnected = false;
    }

    if (this._backdropBlendCompositorConnected) {
      this._backdropBlendCompositor.disconnect();
      this._backdropBlendCompositorConnected = false;
    }

    if (this._stencilClipperConnected) {
      this._stencilClipper.disconnect();
      this._stencilClipperConnected = false;
    }

    this._stencilStates.clear();

    // Every retained group bundle's GL objects died with the lost context:
    // drop them and bump the generations so all recorded instruction sets
    // fail collect-time validation and re-record against the restored
    // context. Any capture in flight is
    // abandoned — its instructions keep the sentinel generation.
    for (const bundle of this._retainedBundles) {
      bundle._invalidateDeviceResources();
    }

    this._retainedCaptures.length = 0;

    // Same argument for the persistent slot stores: their textures and order
    // buffers died with the context, and the generation bump is what tells the
    // plan to treat every visible item as entering again.
    for (const store of this._persistentStores) {
      store.invalidateDeviceResources();
    }

    // Reset the cached GL bind state — every handle these tracked is dead, so
    // the next bind must run unconditionally rather than short-circuiting on a
    // stale identity match.
    this._boundFramebuffer = null;
    this._boundHandles.length = 0;
    this._textureUnit = 0;
    this._vao = null;
    this._shader = null;
    this._blendMode = null;
    this._renderer = null;
    this._renderTarget = this._rootRenderTarget;
    this._activeDrawCommand = null;

    this.rendererRegistry.connect(this);

    // Re-apply the GL global state the constructor establishes (blend enable,
    // clear color, disabled depth / stencil / cull) and re-bind the root
    // target + default blend mode so the next frame draws correctly.
    this._setupContext();
    this._bindRenderTarget(this._renderTarget);
    this.setBlendMode(BlendModes.Normal);

    // Deleting GL objects that belonged to the lost context raises a benign
    // INVALID_OPERATION on some drivers (the handles no longer belong to the
    // live context). Drain the error queue so the rebuilt context starts clean
    // and the application's own `getError()` checks aren't tripped by teardown
    // artifacts. Bounded so a genuinely wedged context can't spin here.
    for (let drained = 0; drained < 64 && gl.getError() !== gl.NO_ERROR; drained++) {
      // Intentionally empty: each getError() call pops one queued error.
    }
  }

  private _createFramebuffer(): WebGLFramebuffer {
    const framebuffer = this._context.createFramebuffer();

    if (framebuffer === null) {
      throw new Error('Could not create framebuffer.');
    }

    return framebuffer;
  }

  private _createTextureHandle(): WebGLTexture {
    const texture = this._context.createTexture();

    if (texture === null) {
      throw new Error('Could not create texture.');
    }

    return texture;
  }

  /**
   * Re-book a managed texture's GPU storage with the resource accountant after a
   * full `texImage2D` (re)allocation: frees the previously booked size (if any —
   * e.g. on resize) and allocates the new `width · height · bytesPerPixel`
   * footprint, including the mip chain when the texture generates mips.
   */
  private _bookTextureStorage(state: ManagedTextureState, texture: Texture | RenderTexture, bytesPerPixel: number): void {
    const nextBytes = estimateTextureBytes(texture.width, texture.height, bytesPerPixel, this._textureMipLevelCount(texture));

    state.accountedBytes = this._accountant.reallocate(state.accountedBytes, nextBytes);
  }

  private _textureMipLevelCount(texture: Texture | RenderTexture): number {
    if (!texture.generateMipMap) {
      return 1;
    }

    const maxSize = Math.max(texture.width, texture.height);

    if (maxSize <= 1) {
      return 1;
    }

    return Math.floor(Math.log2(maxSize)) + 1;
  }

  private _destroyManagedResources(): void {
    for (const renderTarget of [...this._renderTargetStates.keys()]) {
      this._evictRenderTarget(renderTarget, false);
    }

    for (const texture of [...this._textureStates.keys()]) {
      this._evictTexture(texture);
    }

    for (const sampler of this._materialSamplers.values()) {
      this._context.deleteSampler(sampler);
    }

    this._materialSamplers.clear();
  }

  /** Same hit/miss split as {@link _getTextureState}, and for the same reason. */
  private _getRenderTargetState(target: RenderTarget): ManagedRenderTargetState {
    return this._renderTargetStates.get(target) ?? this._createRenderTargetState(target);
  }

  private _createRenderTargetState(target: RenderTarget): ManagedRenderTargetState {
    this._subscribeToDestroy(target, this._renderTargetDestroyHandlers, () => {
      this._evictRenderTarget(target, true);
    });

    const state: ManagedRenderTargetState = {
      framebuffer: target.root ? null : this._createFramebuffer(),
      version: -1,
      attachedTexture: null,
      stencilRenderbuffer: null,
      stencilWidth: 0,
      stencilHeight: 0,
    };

    this._renderTargetStates.set(target, state);

    return state;
  }

  /**
   * The backend-side state for `texture`, created on first sight.
   *
   * The creation half lives in {@link _createTextureState} for one reason: its
   * eviction handlers are closures over `texture`, and V8 allocates the scope
   * that backs them when the function is ENTERED, not when the branch that
   * builds them is taken. Keeping them here cost every cache hit ~45 bytes —
   * and this runs once per bound texture per draw, so a 762-draw blend-churn
   * scene paid 107 KB/frame (3.5 MB/frame at 25 000 draws) for closures it
   * never created.
   */
  private _getTextureState(texture: Texture | RenderTexture): ManagedTextureState {
    return this._textureStates.get(texture) ?? this._createTextureState(texture);
  }

  private _createTextureState(texture: Texture | RenderTexture): ManagedTextureState {
    this._subscribeToDestroy(texture, this._textureDestroyHandlers, () => {
      this._evictTexture(texture);
    });

    if (texture instanceof Texture) {
      this._subscribeToRelease(texture, this._textureReleaseHandlers, () => {
        this._evictTexture(texture, false);
      });
    }

    const state: ManagedTextureState = {
      handle: this._createTextureHandle(),
      samplerKey: -1,
      version: -1,
      width: 0,
      height: 0,
      accountedBytes: 0,
      partialUploadScratch: null,
    };

    this._textureStates.set(texture, state);

    return state;
  }

  private _subscribeToDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
    if (!handlers.has(descriptor)) {
      descriptor.addDestroyListener(handler);
      handlers.set(descriptor, handler);
    }
  }

  private _subscribeToRelease<T extends ReleaseListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
    if (!handlers.has(descriptor)) {
      descriptor.addReleaseListener(handler);
      handlers.set(descriptor, handler);
    }
  }

  private _unsubscribeFromRelease<T extends ReleaseListenable>(descriptor: T, handlers: Map<T, () => void>): void {
    const handler = handlers.get(descriptor);

    if (handler) {
      descriptor.removeReleaseListener(handler);
      handlers.delete(descriptor);
    }
  }

  private _unsubscribeFromDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>): void {
    const handler = handlers.get(descriptor);

    if (handler) {
      descriptor.removeDestroyListener(handler);
      handlers.delete(descriptor);
    }
  }

  private _evictRenderTarget(target: RenderTarget, rebind: boolean): void {
    const state = this._renderTargetStates.get(target);

    this._unsubscribeFromDestroy(target, this._renderTargetDestroyHandlers);

    if (target instanceof RenderTexture) {
      this._evictTexture(target);
    }

    if (state) {
      if (this._boundFramebuffer === state.framebuffer) {
        this._context.bindFramebuffer(this._context.FRAMEBUFFER, null);
        this._boundFramebuffer = null;
      }

      if (state.framebuffer !== null) {
        this._context.deleteFramebuffer(state.framebuffer);
      }

      if (state.stencilRenderbuffer !== null) {
        this._context.deleteRenderbuffer(state.stencilRenderbuffer);
        state.stencilRenderbuffer = null;
      }

      this._renderTargetStates.delete(target);
    }

    this._stencilStates.delete(target);

    if (this._renderTarget === target) {
      this._renderTarget = this._rootRenderTarget;

      if (rebind) {
        this._bindRenderTarget(this._rootRenderTarget);
      }
    }
  }

  /**
   * Free a texture's GPU-side state. `unsubscribeDestroy` is `false` only
   * when called from a {@link Texture.releaseGpu} listener: the handle isn't
   * actually destroyed there, so the destroy subscription must survive for a
   * real, later `destroy()`. The release subscription is always dropped —
   * `_getTextureState` re-subscribes it fresh if the handle is bound again.
   */
  private _evictTexture(texture: Texture | RenderTexture, unsubscribeDestroy = true): void {
    const state = this._textureStates.get(texture);

    if (unsubscribeDestroy) {
      this._unsubscribeFromDestroy(texture, this._textureDestroyHandlers);
    }

    if (texture instanceof Texture) {
      this._unsubscribeFromRelease(texture, this._textureReleaseHandlers);
    }

    if (state) {
      this._context.deleteTexture(state.handle);
      this._forgetTextureHandle(state.handle);
      this._accountant.free(state.accountedBytes);
      state.accountedBytes = 0;
      this._textureStates.delete(texture);
    }
  }

  private _bindRenderTarget(target: RenderTarget): void {
    const state = this._prepareRenderTarget(target);

    if (this._boundFramebuffer !== state.framebuffer || state.version !== target.version) {
      const gl = this._context;
      const viewport = target.getViewport();
      const scaleX = target.root && target.width > 0 ? this._canvas.width / target.width : 1;
      const scaleY = target.root && target.height > 0 ? this._canvas.height / target.height : 1;
      const x = Math.floor(viewport.x * scaleX);
      const width = Math.max(0, Math.round(viewport.width * scaleX));
      const height = Math.max(0, Math.round(viewport.height * scaleY));
      // `viewport.y` is top-left (the View / RenderTarget convention); GL's viewport
      // origin is bottom-left, so flip it. A full viewport (y = 0, height = full) maps
      // to y = 0 unchanged — only partial viewports (split-screen / pip / minimap) were
      // affected, landing at the wrong edge before this flip.
      const backingHeight = target.root ? this._canvas.height : target.height;
      const y = backingHeight - (Math.floor(viewport.y * scaleY) + height);

      gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
      gl.viewport(x, y, width, height);

      // Cache exactly the rect handed to GL so the vertex shaders can map a
      // drawable's clip-space origin into device pixels for position snapping.
      this._deviceViewport.x = x;
      this._deviceViewport.y = y;
      this._deviceViewport.width = width;
      this._deviceViewport.height = height;

      this._boundFramebuffer = state.framebuffer;
      state.version = target.version;
    }

    if (this._clipDepth > 0) {
      this._applyClipState();
    }
  }

  private _setActiveRenderer(renderer: Renderer | null): void {
    if (this._renderer !== renderer) {
      this._flushActiveRenderer();
      this._renderer = renderer;
    }
  }

  private _flushActiveRenderer(): void {
    if (this._renderer && !this._contextLost) {
      this._bindRenderTarget(this._renderTarget);
      this._renderer.flush();
    }
  }

  private _prepareRenderTarget(target: RenderTarget): ManagedRenderTargetState {
    if (target instanceof RenderTexture && target.format !== TextureFormat.Rgba8 && !this._floatRenderable) {
      throw new Error(
        `RenderTexture: format '${target.format}' requires the WebGL2 extension 'EXT_color_buffer_float', which this context does not support. Check backend.supportsColorFormat() and fall back to TextureFormat.Rgba8.`,
      );
    }

    const state = this._getRenderTargetState(target);

    if (target instanceof RenderTexture && state.framebuffer) {
      const previousFramebuffer = this._boundFramebuffer;

      const previousUnit = this._textureUnit;

      this._setTextureUnit(renderTargetTextureSyncUnit);
      const textureState = this._syncTexture(target);
      this._setTextureUnit(previousUnit);

      if (state.attachedTexture !== textureState.handle) {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureState.handle, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);

        state.attachedTexture = textureState.handle;
      }

      // Reset the on-demand flag for pooled RenderTexture targets, so a
      // stencil renderbuffer from a previous use does not permanently
      // consume GPU memory when the target is re-purposed for non-clip
      // rendering.
      if (!this._stencilStates.has(target)) {
        target.needsStencil = false;
      }

      // Keep an existing stencil attachment sized to the (possibly resized)
      // texture so the framebuffer stays complete during non-clip rendering.
      if (target.needsStencil || state.stencilRenderbuffer !== null) {
        this._syncStencilAttachment(target, state);
      }
    }

    return state;
  }

  /** Attach a depth/stencil renderbuffer to the active target if it lacks one. */
  private _ensureTargetStencil(): void {
    const target = this._renderTarget;

    if (target.root) {
      // The default framebuffer's stencil comes from the context attributes.
      return;
    }

    target.needsStencil = true;
    this._syncStencilAttachment(target, this._getRenderTargetState(target));
  }

  private _syncStencilAttachment(target: RenderTarget, state: ManagedRenderTargetState): void {
    if (state.framebuffer === null) {
      return;
    }

    const gl = this._context;
    const width = Math.max(1, target.width);
    const height = Math.max(1, target.height);

    if (state.stencilRenderbuffer !== null && state.stencilWidth === width && state.stencilHeight === height) {
      return;
    }

    if (state.stencilRenderbuffer === null) {
      state.stencilRenderbuffer = gl.createRenderbuffer();
    }

    gl.bindRenderbuffer(gl.RENDERBUFFER, state.stencilRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    const previousFramebuffer = this._boundFramebuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, state.stencilRenderbuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);

    state.stencilWidth = width;
    state.stencilHeight = height;
  }

  private _getStencilState(target: RenderTarget): StencilTargetState {
    let state = this._stencilStates.get(target);

    if (state === undefined) {
      state = { depth: 0, stack: [] };
      this._stencilStates.set(target, state);
    }

    return state;
  }

  /** Re-apply the GL stencil test to match `target`'s current clip depth. */
  private _applyStencilState(target: RenderTarget): void {
    const gl = this._context;
    const depth = this._getStencilState(target).depth;

    if (depth === 0) {
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.disable(gl.STENCIL_TEST);

      return;
    }

    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }

  /**
   * Return the packing scratch for `state`, at least `length` elements long
   * (grown on demand, never shrunk, kind-matched to `source`). It is NOT
   * narrowed to `length`: the caller passes it to the `(…, srcData, srcOffset)`
   * overload, which reads exactly the rectangle's worth of elements from the
   * offset — so a longer buffer uploads the same bytes as an exact-length view
   * would, without allocating one per pack. Reusing this buffer across every
   * `DataTexture` upload that
   * has to be packed at all — instead of allocating a fresh temporary array
   * per sync — is what keeps a barrier-heavy scene's per-frame CPU garbage
   * flat instead of scaling with flush count: each flush's transform (and now
   * separate tint) sync would otherwise allocate its own throwaway packing
   * buffer. Full-width regions never reach here: their rows are already
   * contiguous, so `_syncTexture` hands GL an offset into the texture buffer
   * itself.
   */
  private _acquirePartialUploadScratch(state: ManagedTextureState, source: Float32Array | Uint8Array, length: number): Float32Array | Uint8Array {
    const isFloat = source instanceof Float32Array;
    let scratch = state.partialUploadScratch;

    if (scratch === null || scratch.length < length || isFloat !== scratch instanceof Float32Array) {
      scratch = isFloat ? new Float32Array(length) : new Uint8Array(length);
      state.partialUploadScratch = scratch;
    }

    return scratch;
  }

  /**
   * Bind `texture` to the active unit, uploading first if its contents moved on
   * since the last bind.
   *
   * Split into this binding-only fast path and {@link _syncTextureUpload}
   * because a frame calls it once per bound texture per draw and almost never
   * needs the upload: at a few thousand calls per frame, running them through
   * the upload function's frame cost ~45 B each even when every branch in it
   * was skipped (measured: 107 KB/frame on a 762-draw blend-churn scene, 3.5
   * MB/frame at 25 000 draws, with a matching 19x difference in scavenge count
   * — the bytes are real, not a profiler artefact). Keeping the hot path in a
   * small function of its own removes that entirely.
   */
  private _syncTexture(texture: Texture | RenderTexture): ManagedTextureState {
    assertLiveTexture(texture);

    const state = this._getTextureState(texture);
    const version = texture instanceof RenderTexture ? texture.textureVersion : texture.version;

    this._bindTextureHandle(state.handle);

    const samplerKey = samplerStateKey(texture.scaleMode, texture.wrapMode);

    if (state.samplerKey !== samplerKey) {
      this._applySamplerParameters(texture, state, samplerKey);
    }

    if (state.version === version) {
      return state;
    }

    return this._syncTextureUpload(texture, state, version);
  }

  /**
   * Push `texture`'s filter and wrap state onto its already-bound GL texture
   * object. Only reached when the state actually changed, so the four calls
   * never land on a steady-state frame.
   */
  private _applySamplerParameters(texture: Texture | RenderTexture, state: ManagedTextureState, samplerKey: number): void {
    const gl = this._context;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texture.scaleMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.scaleMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, texture.wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, texture.wrapMode);

    state.samplerKey = samplerKey;
  }

  /**
   * Upload `texture`'s current contents into its already-bound GL texture and
   * re-stamp `state`. Split out of {@link _syncTexture}; never called for a
   * texture whose version the state already carries.
   */
  private _syncTextureUpload(texture: Texture | RenderTexture, state: ManagedTextureState, version: number): ManagedTextureState {
    const gl = this._context;

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);

    if (texture instanceof DataTexture) {
      // `instanceof DataTexture` narrows to `DataTexture<any>` (the generic is
      // erased), so `texture.format` widens to `any`; the class invariant
      // guarantees it is a `DataTextureFormat`, so restore that type here.
      const format: DataTextureFormat = texture.format;
      const formatInfo = webgl2DataTextureFormat(format);
      const region = texture._consumeDirtyRegion();
      const needsAlloc = state.version === -1 || state.width !== texture.width || state.height !== texture.height;

      // Our DataTexture buffers are tightly packed (no per-row padding), but
      // WebGL defaults UNPACK_ALIGNMENT to 4. For single-byte (r8) data a
      // sub-region upload whose width isn't a multiple of 4 would be misread
      // — or rejected with INVALID_OPERATION for height > 1 — leaving the
      // region un-uploaded. That is exactly what corrupts a partial glyph-
      // atlas upload when new glyphs first appear after the initial full
      // upload (e.g. switching to a scene with new characters). Force tight
      // packing for the upload, then restore the GL default.
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      const bytesPerPixel = dataTextureBytesPerPixel(format);

      if (needsAlloc || region === null || region.full) {
        gl.texImage2D(gl.TEXTURE_2D, 0, formatInfo.internalFormat, texture.width, texture.height, 0, formatInfo.format, formatInfo.type, texture.buffer);
        this._bookTextureStorage(state, texture, bytesPerPixel);
        this._accountant.recordTextureUpload(texture.width * texture.height * bytesPerPixel);
      } else {
        const channels = formatInfo.channels;
        const rowChannels = texture.width * channels;

        // A region is already contiguous and tightly packed in the row-major
        // buffer when it spans full rows, and equally when it is a single row
        // (however narrow — one row never straddles a gap). Both let the
        // `(…, srcData, srcOffset)` overload read straight out of the texture
        // buffer at an element offset, with nothing to pack. Between them they
        // cover every shape the engine's own uploads take: full-width bands
        // (ring-buffer style writes, a whole transform store) and single-row
        // spans (a patched transform row, a dirty range inside one texture
        // line), so the packing path below is left to genuinely rectangular
        // sub-regions like a partial glyph-atlas update.
        if ((region.x === 0 && region.width === texture.width) || region.height === 1) {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            region.x,
            region.y,
            region.width,
            region.height,
            formatInfo.format,
            formatInfo.type,
            texture.buffer,
            region.y * rowChannels + region.x * channels,
          );
        } else {
          // The rows are no longer contiguous, so lift the sub-region out of
          // the row-major buffer into a reusable scratch view (grown once,
          // never reallocated per call — see `_acquirePartialUploadScratch`)
          // that gl.texSubImage2D can read as one tightly packed block.
          const subRowChannels = region.width * channels;
          const subView = this._acquirePartialUploadScratch(state, texture.buffer, region.width * region.height * channels);
          const source = texture.buffer;

          if (subRowChannels <= nativeRowCopyThreshold) {
            for (let row = 0; row < region.height; row++) {
              const sourceStart = (region.y + row) * rowChannels + region.x * channels;
              const targetStart = row * subRowChannels;

              for (let i = 0; i < subRowChannels; i++) {
                // In-bounds: the scratch is sized `region.width * region.height
                // * channels` and the region lies inside the texture buffer.
                subView[targetStart + i] = source[sourceStart + i]!;
              }
            }
          } else {
            for (let row = 0; row < region.height; row++) {
              const sourceStart = (region.y + row) * rowChannels + region.x * channels;

              subView.set(source.subarray(sourceStart, sourceStart + subRowChannels), row * subRowChannels);
            }
          }

          gl.texSubImage2D(gl.TEXTURE_2D, 0, region.x, region.y, region.width, region.height, formatInfo.format, formatInfo.type, subView, 0);
        }

        this._accountant.recordTextureUpload(region.width * region.height * bytesPerPixel);
      }

      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    } else if (texture instanceof RenderTexture) {
      const info = webgl2DataTextureFormat(texture.format);

      if (state.version === -1 || state.width !== texture.width || state.height !== texture.height || texture.source === null) {
        gl.texImage2D(gl.TEXTURE_2D, 0, info.internalFormat, texture.width, texture.height, 0, info.format, info.type, texture.source);
        this._bookTextureStorage(state, texture, info.bytesPerPixel);
        this._accountant.recordTextureUpload(texture.width * texture.height * info.bytesPerPixel);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, info.format, info.type, texture.source);
        this._accountant.recordTextureUpload(texture.width * texture.height * info.bytesPerPixel);
      }
    } else if (texture.source) {
      if (state.version === -1 || state.width !== texture.width || state.height !== texture.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        this._bookTextureStorage(state, texture, RGBA8_BYTES_PER_PIXEL);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
      }

      this._accountant.recordTextureUpload(texture.width * texture.height * RGBA8_BYTES_PER_PIXEL);
    }

    // Pixel-store state is upload-local, never inherited - the same discipline
    // the UNPACK_ALIGNMENT restore above follows. GL keeps
    // UNPACK_PREMULTIPLY_ALPHA_WEBGL globally, so leaving it set lets the NEXT
    // upload multiply its RGB channels by its alpha channel. A renderer-private
    // raw upload that never calls pixelStorei itself - the text renderer's
    // RGBA32F node-data texture is the only one today - then inherits it, and
    // in a float payload the "alpha" slot carries real data (a transform's
    // `ty`, an ink-bounds height), so the result is arbitrary geometry rather
    // than merely darker pixels.
    if (texture.premultiplyAlpha) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    if (texture.generateMipMap && (texture instanceof RenderTexture || texture.source !== null)) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    state.version = version;
    state.width = texture.width;
    state.height = texture.height;

    return state;
  }

  /** Writes into `out` and returns it — see {@link _clipPixelStack} for why nothing here allocates. */
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
    const yTop = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
    const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
    const width = Math.max(0, right - x);
    const height = Math.max(0, bottom - yTop);
    const y = Math.max(0, targetHeight - bottom);

    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;

    return out;
  }

  /** Writes the intersection into `out`, which may alias neither input. */
  private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState, out: PixelClipBoundsState): void {
    const left = Math.max(first.x, second.x);
    const bottom = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const top = Math.min(first.y + first.height, second.y + second.height);

    out.x = left;
    out.y = bottom;
    out.width = Math.max(0, right - left);
    out.height = Math.max(0, top - bottom);
  }

  private _applyClipState(): void {
    const gl = this._context;

    if (this._clipDepth === 0) {
      gl.disable(gl.SCISSOR_TEST);

      return;
    }

    // In-bounds: the empty-stack case returned above, so the top entry exists.
    const clip = this._clipPixelStack[this._clipDepth - 1]!;
    const scaleX = this._renderTarget.root && this._renderTarget.width > 0 ? this._canvas.width / this._renderTarget.width : 1;
    const scaleY = this._renderTarget.root && this._renderTarget.height > 0 ? this._canvas.height / this._renderTarget.height : 1;
    const x = Math.floor(clip.x * scaleX);
    const y = Math.floor(clip.y * scaleY);
    const width = Math.max(0, Math.round(clip.width * scaleX));
    const height = Math.max(0, Math.round(clip.height * scaleY));

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, width, height);
  }
}

// Content + render textures upload as gl.RGBA / gl.UNSIGNED_BYTE = 4 bytes/px.
const RGBA8_BYTES_PER_PIXEL = 4;

interface WebGl2DataTextureFormatInfo {
  readonly internalFormat: number; // gl.R8 / gl.R32F / gl.RGBA8 / gl.RGBA16F / gl.RGBA32F
  readonly format: number; // gl.RED / gl.RGBA
  readonly type: number; // gl.UNSIGNED_BYTE / gl.HALF_FLOAT / gl.FLOAT
  readonly channels: number;
  readonly bytesPerPixel: number;
}

type WebGl2DataTextureFormatTable = Readonly<Record<DataTextureFormat | ColorTextureFormat, WebGl2DataTextureFormatInfo>>;

/**
 * The descriptor table, built once and handed out by reference. `_syncTexture`
 * resolves a format for every dirty texture in every frame, so returning a fresh
 * object literal per call meant one descriptor allocation per texture sync.
 *
 * Built on first use rather than at module scope: the enum values are read off
 * the `WebGL2RenderingContext` global, which a plain Node import of the engine
 * does not have. `formatTableSource` keys the cache on the global's identity, so
 * a scope that installs (or replaces) the class after the first lookup still
 * gets a table built from it.
 */
let formatTableSource: unknown = null;
let formatTable: WebGl2DataTextureFormatTable | null = null;

// Only the descriptors are frozen — they are what leaves this module, so they
// are what a call site could otherwise mutate. The table holding them stays a
// plain object: `Object.freeze` on the container buys nothing here (it never
// escapes) and would only risk pushing the per-call keyed lookup out of V8's
// fast property path.
function buildWebgl2DataTextureFormatTable(gl: typeof WebGL2RenderingContext): WebGl2DataTextureFormatTable {
  return {
    [TextureFormat.R8]: Object.freeze({ internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, channels: 1, bytesPerPixel: 1 }),
    [TextureFormat.R32F]: Object.freeze({ internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT, channels: 1, bytesPerPixel: 4 }),
    [TextureFormat.Rgba8]: Object.freeze({ internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, channels: 4, bytesPerPixel: 4 }),
    [TextureFormat.Rgba16F]: Object.freeze({ internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, channels: 4, bytesPerPixel: 8 }),
    [TextureFormat.Rgba32F]: Object.freeze({ internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, channels: 4, bytesPerPixel: 16 }),
  };
}

// Handles both DataTexture (single- and four-channel) and RenderTexture
// (four-channel color attachment) formats — the four-channel entries overlap.
function webgl2DataTextureFormat(format: DataTextureFormat | ColorTextureFormat): WebGl2DataTextureFormatInfo {
  const gl = WebGL2RenderingContext;
  let table = formatTable;

  if (table === null || formatTableSource !== gl) {
    table = buildWebgl2DataTextureFormatTable(gl);
    formatTableSource = gl;
    formatTable = table;
  }

  return table[format];
}
