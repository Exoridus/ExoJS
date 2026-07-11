import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import { dataTextureBytesPerPixel, estimateTextureBytes, GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { Mesh } from '#rendering/mesh/Mesh';
import { resolveUploadTransform } from '#rendering/pixelSnap';
import { type DrawCommand, drawCommandUsesSharedTransform, RenderEntryKind } from '#rendering/plan/RenderCommand';
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
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';
import type { RenderStats } from '#rendering/RenderStats';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import type { Shader } from '#rendering/shader/Shader';
import { DataTexture, type DataTextureFormat } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TransformBuffer } from '#rendering/TransformBuffer';
import { BlendModes, type ColorTextureFormat } from '#rendering/types';
import type { View } from '#rendering/View';

import { WebGl2BackdropBlendCompositor } from './WebGl2BackdropBlendCompositor';
import { WebGl2MaskCompositor } from './WebGl2MaskCompositor';
import { WebGl2MeshRenderer } from './WebGl2MeshRenderer';
import { WebGl2PassCoordinator } from './WebGl2PassCoordinator';
import {
  type WebGl2RecordedTextureState,
  type WebGl2RetainedBatchPayload,
  type WebGl2RetainedBatchReplayer,
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
  version: number;
  width: number;
  height: number;
  /** GPU bytes currently booked for this texture's storage (0 until first upload). */
  accountedBytes: number;
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

// One open retained-capture window (Track B Slice 3). Frames stack for nested
// recording groups (S3-D6): a flushed batch's bytes are stored once in the
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

  private readonly _context: WebGL2RenderingContext;
  private readonly _rootRenderTarget: RenderTarget;
  private readonly _onContextLostHandler: (event: Event) => void;
  private readonly _onContextRestoredHandler: () => void;
  private readonly _textureStates: Map<Texture | RenderTexture, ManagedTextureState> = new Map<Texture | RenderTexture, ManagedTextureState>();
  private readonly _renderTargetStates: Map<RenderTarget, ManagedRenderTargetState> = new Map<RenderTarget, ManagedRenderTargetState>();
  private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
  private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
  private readonly _temporaryRenderTextures: RenderTexture[] = [];
  private readonly _clipBoundsStack: Rectangle[] = [];
  private readonly _clipPixelStack: PixelClipBoundsState[] = [];
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
  private _renderTarget: RenderTarget;
  private readonly _snapTransform: Matrix = new Matrix();
  private _renderer: Renderer | null = null;
  private _renderGroupTransform: Matrix | null = null;
  private _renderGroupTransformId = 0;
  private _shader: Shader | null = null;
  private _blendMode: BlendModes | null = null;
  private _texture: Texture | RenderTexture | null = null;
  private _textureUnit = 0;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _clearColor: Color = new Color();
  private _boundFramebuffer: WebGLFramebuffer | null = null;
  private readonly _stats: RenderStats = createRenderStats();
  private readonly _accountant: GpuResourceAccountant = new GpuResourceAccountant(this._stats);
  private readonly _transformBuffer = new TransformBuffer();
  private _transformTexture: DataTexture<'rgba32f'> | null = null;
  private _transformTextureHash = 0;
  private _transformTextureCount = -1;
  private _activeDrawCommand: DrawCommand | null = null;
  private _drawPlanDepth = 0;
  private readonly _planBaseStack: number[] = [];
  private readonly _planHashStack: number[] = [];
  // Retained instruction-set capture state (Track B Slice 3, Tasks 6/7).
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
    const debug = renderingOptions.debug ?? false;
    this._canvas = app.canvas;

    const gl = this._createContext(webglAttributes);

    if (!gl) {
      throw new Error('This browser or hardware does not support WebGL.');
    }

    this._context = __DEV__ && debug ? makeWebGl2DebugContext(gl) : gl;
    this._contextLost = this._context.isContextLost();

    // Enable + cache float color-buffer renderability. getExtension() is the
    // enable call; without it, RGBA16F/RGBA32F are not color-renderable in WebGL2.
    this._floatRenderable = this._context.getExtension('EXT_color_buffer_float') !== null;

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

  /** @internal */
  public _beginDrawPlan(_nodeCount: number): void {
    // Do NOT reset the transform buffer here — it is frame-scoped (reset in
    // resetStats). The builder already based this plan's node indices at the
    // current buffer count, so writes land in fresh frame-global slots and
    // batches survive across render() calls. Remember this plan's base so a
    // nested plan can free its rows on end.
    this._planBaseStack.push(this._transformBuffer.count);
    this._planHashStack.push(this._transformBuffer.frameHash);
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

    this._transformBuffer.write(command.nodeIndex, this._resolveSnapTransform(drawable), drawable.tint);
  }

  /**
   * Resolve the world transform to upload for `drawable`, applying render-only
   * pixel snapping against the active render target's device-pixel grid when the
   * drawable opts in. Returns the live (unsnapped) global transform for the
   * `'none'` default; never mutates logical state.
   * @internal
   */
  private _resolveSnapTransform(drawable: Drawable): Matrix {
    const target = this._renderTarget;
    const width = target.root ? this._canvas.width : target.width;
    const height = target.root ? this._canvas.height : target.height;

    return resolveUploadTransform(drawable, target.view, width, height, this._snapTransform, this._renderGroupTransform);
  }

  /**
   * Device-pixel dimensions of the active render target — `canvas.width/height`
   * (css × pixelRatio) for the root, or the target's own size for an offscreen
   * {@link RenderTexture}. Used by batched renderers to snap shared geometry
   * boundaries to the same device grid the transform seam snaps the origin to.
   * @internal
   */
  public _getSnapPixelSize(): { readonly width: number; readonly height: number } {
    const target = this._renderTarget;

    return {
      width: target.root ? this._canvas.width : target.width,
      height: target.root ? this._canvas.height : target.height,
    };
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
    return this._transformBuffer.push(this._resolveSnapTransform(drawable), drawable.tint);
  }

  /** @internal */
  public _endDrawPlan(): void {
    this._activeDrawCommand = null;

    const planBase = this._planBaseStack.pop() ?? 0;
    const planHash = this._planHashStack.pop() ?? 0;

    if (this._drawPlanDepth > 0) {
      this._drawPlanDepth--;
    }

    // A nested plan (filter / cacheAsBitmap) just ended: flush its draws, then
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

    // Belt-and-braces for retained recording (S3-D5.1): the recordability
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

  public drawInstanced(mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number): this {
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

    renderer.drawInstancedBatch(mesh, startNodeIndex, count);
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

    this._clipBoundsStack.push(bounds.clone());

    const nextClip = this._toClipPixels(bounds);
    const previousClip = this._clipPixelStack.length > 0 ? this._clipPixelStack[this._clipPixelStack.length - 1] : null;
    const resolvedClip = previousClip ? this._intersectClips(previousClip, nextClip) : nextClip;

    this._clipPixelStack.push(resolvedClip);
    this._applyClipState();

    return this;
  }

  public popScissorRect(): this {
    if (this._clipBoundsStack.length === 0) {
      return this;
    }

    this._flushActiveRenderer();

    const removedClip = this._clipBoundsStack.pop();

    if (removedClip) {
      removedClip.destroy();
    }

    this._clipPixelStack.pop();
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
    return format === 'rgba8' || this._floatRenderable;
  }

  public acquireRenderTexture(width: number, height: number): RenderTexture {
    for (let index = 0; index < this._temporaryRenderTextures.length; index++) {
      // In-bounds: `index` ranges over `0..length-1`.
      const texture = this._temporaryRenderTextures[index]!;

      if (texture.width === width && texture.height === height) {
        this._temporaryRenderTextures.splice(index, 1);

        return texture;
      }
    }

    return new RenderTexture(width, height);
  }

  public releaseRenderTexture(texture: RenderTexture): this {
    if (this._temporaryRenderTextures.includes(texture)) {
      return this;
    }

    texture.setView(null);
    this._temporaryRenderTextures.push(texture);

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
      if (this._texture !== null) {
        this._context.bindTexture(this._context.TEXTURE_2D, null);
        this._texture = null;
      }

      return this;
    }

    const textureState = this._syncTexture(texture);

    this._context.bindTexture(this._context.TEXTURE_2D, textureState.handle);
    this._texture = texture;

    return this;
  }

  /**
   * Make `unit` the active texture unit through the backend's unit cache.
   *
   * Renderers that bind a *raw* `WebGLTexture` to a unit (e.g. the text
   * renderer's private node-data texture) must route the unit switch through
   * here instead of calling `gl.activeTexture` directly — otherwise the cache
   * goes stale and a later {@link bindTexture} can skip its own `activeTexture`
   * call, binding to the wrong unit. After this returns the caller may issue its
   * own raw `gl.bindTexture` on the now-active unit.
   * @internal
   */
  public setActiveTextureUnit(unit: number): this {
    this._setTextureUnit(unit);

    return this;
  }

  /** @internal */
  public bindTransformBufferTexture(unit: number, minCount: number): this {
    const requiredCount = Math.max(1, minCount);
    const transformTexture = this._transformTexture;

    if (transformTexture?.height !== this._transformBuffer.capacity || transformTexture.buffer !== this._transformBuffer.data) {
      transformTexture?.destroy();

      this._transformTexture = new DataTexture({
        width: 3,
        height: this._transformBuffer.capacity,
        format: 'rgba32f',
        data: this._transformBuffer.data,
      });
      this._transformTextureHash = 0;
      this._transformTextureCount = -1;
    }

    const snapshot = this._transformBuffer.commitSnapshot(requiredCount);
    const nextTransformTexture = this._transformTexture;

    if (nextTransformTexture === null) {
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
      const { firstRow, rowCount } = this._transformBuffer.consumeDirtyRange(snapshot.count);

      if (rowCount > 0) {
        nextTransformTexture.commitRect(0, firstRow, 3, rowCount);
        this._transformBuffer.recordUpload(rowCount);
      }

      this._transformTextureCount = snapshot.count;
      this._transformTextureHash = snapshot.hash;
    }

    return this.bindTexture(nextTransformTexture, unit);
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
   * Active per-group transform for the draws submitted until the next call
   * (Track B Slice 2, S2-D2). `null` means identity (no retained group).
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
   * A group is a flush boundary by design (S2-D2) — the pending batch must
   * drain under the OLD group matrix before the new one takes effect.
   * @internal
   */
  public _setRenderGroupTransform(transform: Matrix | null): void {
    this._flushActiveRenderer();
    this._renderGroupTransform = transform;
    this._renderGroupTransformId++;
  }

  // ── Retained instruction-set hooks (Track B Slice 3, Tasks 6/7) ──────────

  /**
   * Whether at least one retained-capture window is open. Read by capable
   * renderers at flush time to hand their packed batch to
   * {@link _recordRetainedBatch}, and at render time for the belt-and-braces
   * poison checks (S3-D5).
   * @internal
   */
  public get _isRetainedCapturing(): boolean {
    return this._retainedCaptures.length > 0;
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
   * indices in the recorded bytes are rebased group-local (S3-D4), the
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

    if (range.max < range.min) {
      return;
    }

    for (const payload of frame.payloads) {
      payload.replayer._rebaseRetainedNodeIndices(payload, range.min);
    }

    frame.bundle._storeTransformRows(this._transformBuffer.data, range.min, range.max - range.min + 1);
    frame.bundle._connectDevice(this._context, this._accountant);
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
   * frame's set (S3-D6 — outer sets hold inner bundles' batches verbatim).
   * Called by capable renderers from `flush()` while a capture is open.
   * @internal
   */
  public _recordRetainedBatch(
    replayer: WebGl2RetainedBatchReplayer,
    words: Uint32Array,
    instanceCount: number,
    blendMode: BlendModes,
    textures: ReadonlyArray<Texture | RenderTexture | null>,
    textureCount: number,
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
   * entry-replay tier. Belt-and-braces for draws the recordability predicate
   * should have excluded (S3-D5); never expected on a healthy path.
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
   * Collect-time backend validation (S3-D3) on top of the plan-level
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

    for (const instruction of set.instructions) {
      if (instruction.kind !== RetainedInstructionKind.Batch) {
        continue;
      }

      const payload = instruction.payload as WebGl2RetainedBatchPayload | null;

      if (payload === null || typeof payload !== 'object' || !(payload.bundle instanceof WebGl2RetainedGroupResources)) {
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
    this._stats.submittedNodes += batch.instanceCount;
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
    this._destroyTemporaryRenderTextures();

    for (const clipBounds of this._clipBoundsStack) {
      clipBounds.destroy();
    }

    this._clipBoundsStack.length = 0;
    this._clipPixelStack.length = 0;
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

    this._vao = null;
    this._renderer = null;
    this._shader = null;
    this._blendMode = null;
    this._texture = null;
    this._boundFramebuffer = null;
    this._activeDrawCommand = null;
    this._transformTextureCount = -1;
    this._transformTextureHash = 0;
  }

  private _createContext(options?: WebGLContextAttributes): WebGL2RenderingContext | null {
    try {
      // Force a stencil buffer on the default framebuffer so geometric stencil
      // clipping (RenderNode.clip with a Geometry clipShape) works on the root
      // target. Inert until a clip is pushed (STENCIL_TEST stays disabled).
      return this._canvas.getContext('webgl2', { ...options, stencil: true });
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
   * use. Mirrors the WebGPU backend's `_teardownDeviceState` (B-09).
   */
  private _reinitializeDeviceState(): void {
    const gl = this._context;

    // Re-enable the float color-buffer extension: extension enablement does
    // not survive a context loss, so RGBA16F/RGBA32F render targets would stop
    // being color-renderable until this is re-fetched on the fresh context.
    this._floatRenderable = gl.getExtension('EXT_color_buffer_float') !== null;

    // Evict all managed texture / render-target state (deletes the now-dead
    // handles — harmless on the fresh context — frees the resource accountant,
    // and detaches destroy listeners). The maps are repopulated lazily with
    // fresh handles on next access. Clears `_stencilStates` too (each entry is
    // dropped when its render target is evicted).
    this._destroyManagedResources();

    // The shared transform texture's handle died with the context. Drop the
    // wrapper (its GL handle was just evicted above) and reset the upload
    // bookkeeping so a fresh DataTexture + full re-upload happens on next bind.
    this._transformTexture = null;
    this._transformTextureCount = -1;
    this._transformTextureHash = 0;

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
    // context (S3-D3, stale-instruction pitfall #9). Any capture in flight is
    // abandoned — its instructions keep the sentinel generation.
    for (const bundle of this._retainedBundles) {
      bundle._invalidateDeviceResources();
    }

    this._retainedCaptures.length = 0;

    // Reset the cached GL bind state — every handle these tracked is dead, so
    // the next bind must run unconditionally rather than short-circuiting on a
    // stale identity match.
    this._boundFramebuffer = null;
    this._texture = null;
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
      this._evictTexture(texture, false);
    }
  }

  private _destroyTemporaryRenderTextures(): void {
    for (const texture of this._temporaryRenderTextures) {
      texture.destroy();
    }

    this._temporaryRenderTextures.length = 0;
  }

  private _getRenderTargetState(target: RenderTarget): ManagedRenderTargetState {
    let state = this._renderTargetStates.get(target);

    if (!state) {
      this._subscribeToDestroy(target, this._renderTargetDestroyHandlers, () => {
        this._evictRenderTarget(target, true);
      });

      state = {
        framebuffer: target.root ? null : this._createFramebuffer(),
        version: -1,
        attachedTexture: null,
        stencilRenderbuffer: null,
        stencilWidth: 0,
        stencilHeight: 0,
      };

      this._renderTargetStates.set(target, state);
    }

    return state;
  }

  private _getTextureState(texture: Texture | RenderTexture): ManagedTextureState {
    let state = this._textureStates.get(texture);

    if (!state) {
      this._subscribeToDestroy(texture, this._textureDestroyHandlers, () => {
        this._evictTexture(texture, true);
      });

      state = {
        handle: this._createTextureHandle(),
        version: -1,
        width: 0,
        height: 0,
        accountedBytes: 0,
      };

      this._textureStates.set(texture, state);
    }

    return state;
  }

  private _subscribeToDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
    if (!handlers.has(descriptor)) {
      descriptor.addDestroyListener(handler);
      handlers.set(descriptor, handler);
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
      this._evictTexture(target, false);
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

  private _evictTexture(texture: Texture | RenderTexture, rebind: boolean): void {
    const state = this._textureStates.get(texture);

    this._unsubscribeFromDestroy(texture, this._textureDestroyHandlers);

    if (state) {
      if (this._texture === texture) {
        this._context.bindTexture(this._context.TEXTURE_2D, null);
        this._texture = null;
      }

      this._context.deleteTexture(state.handle);
      this._accountant.free(state.accountedBytes);
      state.accountedBytes = 0;
      this._textureStates.delete(texture);
    }

    if (this._texture === texture) {
      this._texture = null;
    }

    if (rebind && this._texture !== null) {
      this.bindTexture(this._texture);
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

      this._boundFramebuffer = state.framebuffer;
      state.version = target.version;
    }

    if (this._clipPixelStack.length > 0) {
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
    if (target instanceof RenderTexture && target.format !== 'rgba8' && !this._floatRenderable) {
      throw new Error(
        `RenderTexture: format '${target.format}' requires the WebGL2 extension 'EXT_color_buffer_float', which this context does not support. Check backend.supportsColorFormat() and fall back to 'rgba8'.`,
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

  private _syncTexture(texture: Texture | RenderTexture): ManagedTextureState {
    const gl = this._context;
    const state = this._getTextureState(texture);
    const version = texture instanceof RenderTexture ? texture.textureVersion : texture.version;

    gl.bindTexture(gl.TEXTURE_2D, state.handle);

    if (state.version !== version) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texture.scaleMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.scaleMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, texture.wrapMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, texture.wrapMode);
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
          // Partial upload: pack a contiguous sub-region from the row-major
          // buffer into a temporary view that gl.texSubImage2D can read.
          const channels = formatInfo.channels;
          const rowFloats = texture.width * channels;
          const subFloats = region.width * channels;
          const subView =
            texture.buffer instanceof Float32Array
              ? new Float32Array(region.width * region.height * channels)
              : new Uint8Array(region.width * region.height * channels);

          for (let row = 0; row < region.height; row++) {
            const sourceStart = (region.y + row) * rowFloats + region.x * channels;
            const targetStart = row * subFloats;
            subView.set(texture.buffer.subarray(sourceStart, sourceStart + subFloats), targetStart);
          }

          gl.texSubImage2D(gl.TEXTURE_2D, 0, region.x, region.y, region.width, region.height, formatInfo.format, formatInfo.type, subView);
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

      if (texture.generateMipMap && (texture instanceof RenderTexture || texture.source !== null)) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      state.version = version;
      state.width = texture.width;
      state.height = texture.height;
    }

    return state;
  }

  private _toClipPixels(bounds: Rectangle): PixelClipBoundsState {
    const topLeft = this._renderTarget.mapCoordsToPixel(this._clipPointA.set(bounds.left, bounds.top));
    const bottomRight = this._renderTarget.mapCoordsToPixel(this._clipPointB.set(bounds.right, bounds.bottom));
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

    return {
      x,
      y,
      width,
      height,
    };
  }

  private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState): PixelClipBoundsState {
    const left = Math.max(first.x, second.x);
    const bottom = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const top = Math.min(first.y + first.height, second.y + second.height);

    return {
      x: left,
      y: bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, top - bottom),
    };
  }

  private _applyClipState(): void {
    const gl = this._context;

    if (this._clipPixelStack.length === 0) {
      gl.disable(gl.SCISSOR_TEST);

      return;
    }

    // In-bounds: the empty-stack case returned above, so the top entry exists.
    const clip = this._clipPixelStack[this._clipPixelStack.length - 1]!;
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

// Handles both DataTexture (single- and four-channel) and RenderTexture
// (four-channel color attachment) formats — the four-channel entries overlap.
function webgl2DataTextureFormat(format: DataTextureFormat | ColorTextureFormat): WebGl2DataTextureFormatInfo {
  const gl = WebGL2RenderingContext;
  switch (format) {
    case 'r8':
      return { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, channels: 1, bytesPerPixel: 1 };
    case 'r32f':
      return { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT, channels: 1, bytesPerPixel: 4 };
    case 'rgba8':
      return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, channels: 4, bytesPerPixel: 4 };
    case 'rgba16f':
      return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, channels: 4, bytesPerPixel: 8 };
    case 'rgba32f':
      return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, channels: 4, bytesPerPixel: 16 };
  }
}
