/// <reference types="@webgpu/types" />

import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderPassCoordinator } from '#rendering/pass/RenderPassCoordinator';
import type { RenderPassDescriptor, RenderPassLoad } from '#rendering/pass/RenderPassDescriptor';
import type { RenderStats } from '#rendering/RenderStats';
import type { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

import { stencilAttachmentFormat, WebGpuStencilClipper } from './WebGpuStencilClipper';

/** Pixel-space scissor rectangle, as returned by the backend. @internal */
interface ScissorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The active GPU render pass owned by the coordinator: the command encoder, the
 * open pass encoder, and the target/view/stencil state it was opened for.
 * @internal
 */
export interface WebGpuActiveRenderPass {
  readonly encoder: GPUCommandEncoder;
  readonly pass: GPURenderPassEncoder;
  readonly targetFormat: GPUTextureFormat;
  readonly view: View;
  /**
   * The view's {@link View.updateId} captured when this pass was opened.
   * Renderers compare it against the live `view.updateId` before rewriting the
   * shared projection uniform into a still-open pass: a bump means the same View
   * object was mutated (e.g. a camera pan with no identity change) between two
   * merged flushes, which would retroactively re-project batches already
   * recorded here - so the renderer ends the pass first.
   */
  readonly viewUpdateId: number;
  readonly stencilEnabled: boolean;
  readonly stencilRef: number;
}

/**
 * The reused descriptor's `depthStencilAttachment` has to be assignable to
 * `undefined` (a pass without a stencil clip clears it), which the generated
 * WebGPU types do not allow under `exactOptionalPropertyTypes`.
 */
type ReusablePassDescriptor = Omit<GPURenderPassDescriptor, 'depthStencilAttachment'> & {
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment | undefined;
};

/** Hoisted: the encoder descriptor is a constant, and `acquirePass` runs per pass. */
const commandEncoderDescriptor: GPUCommandEncoderDescriptor = { label: 'pass-coordinator:command-encoder' };

interface StencilClipEntry {
  readonly shape: Geometry;
  readonly transform: Matrix;
}

/**
 * The minimal surface of {@link WebGpuBackend} the coordinator drives. Declared
 * structurally so the coordinator is decoupled from the backend class and is
 * unit-testable with a mock.
 * @internal
 */
export interface WebGpuPassBackend {
  /**
   * The persistent clear colour, read and restored around a child pass -
   * `clear(colour)` writes through to it.
   */
  readonly clearColor: Color;
  /**
   * Set the persistent clear colour. Restoring it after a child pass has to go
   * through this rather than mutating {@link clearColor} in place: on WebGL2 the
   * value is mirrored into GL state here and nowhere else per frame, so an
   * in-place write would leave the object and the context disagreeing.
   */
  setClearColor(color: Color): unknown;
  readonly renderTarget: RenderTarget;
  readonly view: View;
  readonly device: GPUDevice;
  readonly renderTargetFormat: GPUTextureFormat;
  readonly stats: RenderStats;
  setRenderTarget(target: RenderTarget | null): unknown;
  setView(view: View | null): unknown;
  clear(color?: Color): unknown;
  flush(): unknown;
  pushScissorRect(bounds: Rectangle): unknown;
  popScissorRect(): unknown;
  createColorAttachment(): GPURenderPassColorAttachment;
  getScissorRect(): ScissorRect | null;
  submit(commandBuffer: GPUCommandBuffer): void;
  /** Whether `target` already holds rendered content this frame. */
  _targetHasContent(target: RenderTarget): boolean;
  /** Physical (backing-store) pixel size of `target`'s colour attachment. */
  _getAttachmentPixelSize(target: RenderTarget): { readonly width: number; readonly height: number };
}

/**
 * WebGPU implementation of {@link RenderPassCoordinator}.
 *
 * Owns the GPU render-pass mechanics (acquire/end the active
 * `GPURenderPassEncoder`), the clear-vs-load decision, and geometric stencil
 * clipping: a per-target `depth24plus-stencil8` attachment
 * shared across the multiple submits of a clip scope (via `stencilLoadOp:'load'`)
 * plus a position-only stencil-write pipeline. Renderers select stencil-enabled
 * content pipelines while {@link stencilActive} is true.
 * @internal
 */
export class WebGpuPassCoordinator implements RenderPassCoordinator {
  private readonly _backend: WebGpuPassBackend;
  /**
   * Scratch colour used only to restore the clear colour after a child pass.
   * One per coordinator rather than one per pass: child passes nest, but each
   * level holds its own four channel values in locals and restores
   * innermost-first, so a single instance is never read across levels.
   */
  private readonly _clearColorScratch = new Color();
  private readonly _stencil = new WebGpuStencilClipper();
  private readonly _stencilDepths = new Map<RenderTarget, number>();
  private readonly _stencilStacks = new Map<RenderTarget, StencilClipEntry[]>();
  private _stencilConnected = false;
  private _stencilWriteInProgress = false;
  private _stencilLoadOp: GPULoadOp = 'load';
  private _stencilRef = 0;
  private _active: WebGpuActiveRenderPass | null = null;
  private _passHasDraws = false;
  /** Reused render-pass descriptor and its colour-attachment list - see {@link acquirePass}. */
  private readonly _colorAttachments: Array<GPURenderPassColorAttachment | null> = [null];
  private readonly _passDescriptor: ReusablePassDescriptor = {
    label: 'pass-coordinator:render-pass',
    colorAttachments: this._colorAttachments,
  };

  public constructor(backend: WebGpuPassBackend) {
    this._backend = backend;
  }

  public get activeTarget(): RenderTarget {
    return this._backend.renderTarget;
  }

  public get activeView(): View {
    return this._backend.view;
  }

  public get hasActivePass(): boolean {
    return this._active !== null;
  }

  /** The open GPU pass, or `null` when none is open. @internal */
  public get activePass(): WebGpuActiveRenderPass | null {
    return this._active;
  }

  /**
   * Whether the open pass holds draws recorded by anyone - this renderer or
   * another one. The pass survives a renderer switch, so a renderer's own
   * cursors no longer answer "would mutating a resource now retroactively
   * change a draw already in this pass": the draw may belong to a renderer that
   * flushed earlier into the same pass.
   *
   * The contract deliberately stops at a boolean. Guards against a *shared*
   * resource being mutated under recorded draws (the transform storage buffer,
   * managed texture content) need only "does this pass hold any draw" - never
   * "whose". Every "is it mine" question is answered locally, by comparing
   * against {@link activePass} by identity.
   * @internal
   */
  public get passHasDraws(): boolean {
    return this._passHasDraws;
  }

  /**
   * Record that a draw was encoded into the open pass. Called by every renderer
   * at the site that bumps `stats.drawCalls`. A no-op with no pass open.
   * @internal
   */
  public markPassDraws(): void {
    if (this._active !== null) {
      this._passHasDraws = true;
    }
  }

  /**
   * Whether a geometric stencil clip is currently in effect on the active
   * target. Renderers read this to select a stencil-enabled content pipeline
   * (matching the depth/stencil attachment {@link acquirePass} adds).
   * @internal
   */
  public get stencilActive(): boolean {
    return this._stencilWriteInProgress || this._activeTargetDepth() > 0;
  }

  /** Current stencil reference value content pipelines must test against. @internal */
  public get stencilReference(): number {
    return this._stencilRef;
  }

  /**
   * Open (or return the already-open) GPU render pass for the backend's current
   * target/view. Resolves colour load/clear via {@link createColorAttachment},
   * counts the pass, applies the active scissor, and - when a stencil clip is in
   * effect - attaches the per-target depth/stencil buffer and sets the reference.
   */
  public acquirePass(): WebGpuActiveRenderPass {
    if (this._active !== null) {
      return this._active;
    }

    const backend = this._backend;
    const stencilEnabled = this.stencilActive;
    // Descriptor and attachment list are reused: `beginRenderPass` and
    // `createCommandEncoder` read their descriptors synchronously, so neither
    // has to survive the call. An effect-heavy frame opens hundreds of passes
    // (501 on `filter/color 100`), where a fresh descriptor plus a fresh
    // one-element array per pass is a measurable per-pass cost. The `_active`
    // record below is deliberately NOT pooled - renderers compare it by
    // identity to decide whether their draws are in the open pass.
    const descriptor = this._passDescriptor;

    this._colorAttachments[0] = backend.createColorAttachment();
    descriptor.depthStencilAttachment = stencilEnabled ? this._createStencilAttachment(backend.renderTarget) : undefined;

    const encoder = backend.device.createCommandEncoder(commandEncoderDescriptor);
    // Cast, not `delete`: an absent optional dictionary member and one set to
    // `undefined` are the same thing to WebIDL, while `delete` would push the
    // reused descriptor into dictionary mode. `exactOptionalPropertyTypes` is
    // what makes the two spellings differ to TypeScript, not to the browser.
    const pass = encoder.beginRenderPass(descriptor as GPURenderPassDescriptor);

    this._passHasDraws = false;
    backend.stats.renderPasses++;

    const scissor = backend.getScissorRect();

    if (scissor !== null && scissor.width > 0 && scissor.height > 0) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
    }

    this._applyViewport(pass);

    if (stencilEnabled) {
      pass.setStencilReference(this._stencilRef);
    }

    this._active = {
      encoder,
      pass,
      targetFormat: backend.renderTargetFormat,
      view: backend.view,
      viewUpdateId: backend.view.updateId,
      stencilEnabled,
      stencilRef: this._stencilRef,
    };

    return this._active;
  }

  /**
   * Drop the open pass WITHOUT ending or submitting it. For teardown paths only,
   * where the recorded draws must not reach the queue at all: backend destroy,
   * and device-loss teardown, where the encoder belongs to the dead device.
   *
   * Leaving `_active` set is the failure this exists to prevent. The coordinator
   * instance outlives a device-loss recovery, and {@link acquirePass}
   * short-circuits on an already-open pass - so a pass left open across the
   * teardown would be handed back to the RESTORED device, which would then
   * record every later frame into the dead device's encoder, silently and for
   * the rest of the session. Operations on a lost device do not throw, so
   * nothing would surface the breakage.
   * @internal
   */
  public discardPass(): void {
    this._active = null;
    this._passHasDraws = false;
  }

  /** End and submit the active GPU pass, if any. Idempotent. */
  public endPass(): void {
    const active = this._active;

    if (active === null) {
      return;
    }

    this._active = null;
    this._passHasDraws = false;
    active.pass.end();
    this._backend.submit(active.encoder.finish());
  }

  public beginPass(descriptor: RenderPassDescriptor): void {
    this._backend.setRenderTarget(descriptor.target);
    this._backend.setView(descriptor.view);

    if (descriptor.load === 'clear') {
      this._backend.clear(descriptor.clearColor ?? undefined);
    }
  }

  public withChildPass(descriptor: RenderPassDescriptor, body: () => void): void {
    const previousTarget = this._backend.renderTarget;
    const previousView = this._backend.view;
    // The clear colour is pass state too, and `backend.clear(colour)` writes it
    // through to the persistent one. Without restoring it, a single effect
    // capture -- which clears to transparent black -- silently repaints every
    // later frame's background: the app's `clearColor` is gone for the rest of
    // the session. Saved as four numbers rather than a cloned Color because
    // child passes nest and this is the effect path's hot loop.
    const { r: previousR, g: previousG, b: previousB, a: previousA } = this._backend.clearColor;

    this.beginPass(descriptor);

    try {
      body();
    } finally {
      // setRenderTarget flushes the active renderer on change, which self-closes
      // its GPU pass, so the child's draws are committed into the child target
      // before the bind switches back.
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
      this._backend.setClearColor(this._clearColorScratch.set(previousR, previousG, previousB, previousA));
    }
  }

  public pushScissorRect(bounds: Rectangle): void {
    this._backend.pushScissorRect(bounds);
  }

  public popScissorRect(): void {
    this._backend.popScissorRect();
  }

  /**
   * Establish a geometric stencil clip on the active target. The shape silhouette
   * is incremented into the stencil buffer where it covers the already-valid
   * region (intersection on nesting); subsequent content draws are restricted to
   * the new depth via the stencil-enabled content pipelines.
   */
  public pushStencilClip(shape: Geometry, transform: Matrix): void {
    const target = this._backend.renderTarget;
    const depth = this._stencilDepths.get(target) ?? 0;

    if (depth >= 255) {
      throw new Error('Stencil clip nesting exceeds the 255-level limit.');
    }

    this._connectStencil();
    this.endPass();

    // The write pass tests stencil == depth and increments to depth+1. At the
    // outermost level the stencil aspect is cleared first so stale values from a
    // previous frame cannot leak in; deeper levels load the existing buffer.
    this._stencilWriteInProgress = true;
    this._stencilRef = depth;
    this._stencilLoadOp = depth === 0 ? 'clear' : 'load';

    const active = this.acquirePass();
    this._stencil.draw(active.pass, active.targetFormat, true, shape, transform, active.view);
    this.markPassDraws();
    this.endPass();

    this._stencilWriteInProgress = false;
    this._stencilDepths.set(target, depth + 1);
    this._stencilRef = depth + 1;
    this._getStencilStack(target).push({ shape, transform: new Matrix().copy(transform) });
  }

  /** Pop the most recent stencil clip on the active target, restoring the outer level. */
  public popStencilClip(): void {
    const target = this._backend.renderTarget;
    const stack = this._stencilStacks.get(target);
    const entry = stack?.pop();

    if (entry === undefined) {
      return;
    }

    const depth = this._stencilDepths.get(target) ?? 0;

    this.endPass();

    // The decrement pass tests stencil == depth and decrements the region this
    // clip incremented, restoring the outer level. The stencil aspect is loaded.
    this._stencilWriteInProgress = true;
    this._stencilRef = depth;
    this._stencilLoadOp = 'load';

    const active = this.acquirePass();
    this._stencil.draw(active.pass, active.targetFormat, false, entry.shape, entry.transform, active.view);
    this.markPassDraws();
    this.endPass();

    this._stencilWriteInProgress = false;
    this._stencilDepths.set(target, depth - 1);
    this._stencilRef = depth - 1;
  }

  public resolveLoad(target: RenderTarget, clearRequested: boolean): RenderPassLoad {
    // Clear when explicitly requested or when the target holds no content to
    // preserve; otherwise load, so a render texture keeps its prior contents
    // across multiple passes in the same frame.
    return clearRequested || !this._backend._targetHasContent(target) ? 'clear' : 'load';
  }

  /**
   * Drop a target's cached stencil attachment and clip state. Called when the
   * target is destroyed so a pooled render texture never reuses a stale buffer.
   * @internal
   */
  public releaseStencilTarget(target: RenderTarget): void {
    if (this._stencilConnected) {
      this._stencil.releaseAttachment(target);
    }

    this._stencilDepths.delete(target);
    this._stencilStacks.delete(target);
  }

  /**
   * Drop all stencil clip bookkeeping (depths, stacks, write/ref state). Invoked
   * on the unbalanced-clip recovery path at the end of a draw plan (see
   * `WebGpuBackend._endDrawPlan`) so a leaked clip cannot corrupt the next frame;
   * backend destroy / device loss go through `destroyStencil` instead. @internal
   */
  public resetStencil(): void {
    this._stencilDepths.clear();
    this._stencilStacks.clear();
    this._stencilWriteInProgress = false;
    this._stencilRef = 0;
  }

  /** Tear down all stencil GPU resources (device loss / backend destroy). @internal */
  public destroyStencil(): void {
    if (this._stencilConnected) {
      this._stencil.disconnect();
      this._stencilConnected = false;
    }

    this._stencilDepths.clear();
    this._stencilStacks.clear();
    this._stencilWriteInProgress = false;
    this._stencilRef = 0;
  }

  /** Number of unpopped stencil clips across all targets (balance assertion). @internal */
  public unbalancedStencilClips(): number {
    let total = 0;

    for (const stack of this._stencilStacks.values()) {
      total += stack.length;
    }

    return total;
  }

  private _activeTargetDepth(): number {
    return this._stencilDepths.get(this._backend.renderTarget) ?? 0;
  }

  /**
   * Apply the active view's normalized (0..1) viewport as the GPU viewport, so
   * split-screen / pip / minimap views render into their framebuffer region.
   * WebGPU's framebuffer origin is top-left (y-down), so `viewport.y` maps
   * directly - no flip (unlike WebGL2's bottom-left `gl.viewport`). A full
   * viewport is left at the pass default to avoid a redundant call.
   */
  private _applyViewport(pass: GPURenderPassEncoder): void {
    const vp = this._backend.view.viewport;

    if (vp.x === 0 && vp.y === 0 && vp.width === 1 && vp.height === 1) {
      return;
    }

    const { width, height } = this._backend._getAttachmentPixelSize(this._backend.renderTarget);
    const x = Math.floor(vp.x * width);
    const y = Math.floor(vp.y * height);
    const w = Math.max(1, Math.round(vp.width * width));
    const h = Math.max(1, Math.round(vp.height * height));

    pass.setViewport(x, y, w, h, 0, 1);
  }

  private _connectStencil(): void {
    if (!this._stencilConnected) {
      this._stencil.connect(this._backend.device);
      this._stencilConnected = true;
    }
  }

  private _getStencilStack(target: RenderTarget): StencilClipEntry[] {
    let stack = this._stencilStacks.get(target);

    if (stack === undefined) {
      stack = [];
      this._stencilStacks.set(target, stack);
    }

    return stack;
  }

  private _createStencilAttachment(target: RenderTarget): GPURenderPassDepthStencilAttachment {
    // Size the stencil attachment to the colour attachment's physical pixels, not
    // the target's logical size. The root canvas backing store is logical ×
    // pixelRatio, so a logical-sized stencil buffer would mismatch the
    // getCurrentTexture() colour attachment at pixelRatio > 1; RenderTexture
    // targets report the same size for both, so they are unaffected.
    const { width, height } = this._backend._getAttachmentPixelSize(target);
    const view = this._stencil.getAttachmentView(target, width, height);
    const stencilLoadOp = this._stencilLoadOp;

    // Consumed once; subsequent passes within the clip scope load the buffer.
    this._stencilLoadOp = 'load';

    return {
      view,
      depthReadOnly: true,
      stencilLoadOp,
      stencilStoreOp: 'store',
      stencilClearValue: 0,
    };
  }
}

export { stencilAttachmentFormat };
