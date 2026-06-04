/// <reference types="@webgpu/types" />

import type { Color } from '@/core/Color';
import { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';

import type { Geometry } from '../geometry/Geometry';
import type { RenderPassCoordinator } from '../pass/RenderPassCoordinator';
import type { RenderPassDescriptor, RenderPassLoad } from '../pass/RenderPassDescriptor';
import type { RenderStats } from '../RenderStats';
import type { RenderTarget } from '../RenderTarget';
import type { View } from '../View';
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
  readonly stencilEnabled: boolean;
  readonly stencilRef: number;
}

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
  private readonly _stencil = new WebGpuStencilClipper();
  private readonly _stencilDepths = new Map<RenderTarget, number>();
  private readonly _stencilStacks = new Map<RenderTarget, StencilClipEntry[]>();
  private _stencilConnected = false;
  private _stencilWriteInProgress = false;
  private _stencilLoadOp: GPULoadOp = 'load';
  private _stencilRef = 0;
  private _active: WebGpuActiveRenderPass | null = null;

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
   * counts the pass, applies the active scissor, and — when a stencil clip is in
   * effect — attaches the per-target depth/stencil buffer and sets the reference.
   */
  public acquirePass(): WebGpuActiveRenderPass {
    if (this._active !== null) {
      return this._active;
    }

    const backend = this._backend;
    const stencilEnabled = this.stencilActive;
    const descriptor: GPURenderPassDescriptor = {
      colorAttachments: [backend.createColorAttachment()],
    };

    if (stencilEnabled) {
      descriptor.depthStencilAttachment = this._createStencilAttachment(backend.renderTarget);
    }

    const encoder = backend.device.createCommandEncoder();
    const pass = encoder.beginRenderPass(descriptor);

    backend.stats.renderPasses++;

    const scissor = backend.getScissorRect();

    if (scissor !== null && scissor.width > 0 && scissor.height > 0) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
    }

    if (stencilEnabled) {
      pass.setStencilReference(this._stencilRef);
    }

    this._active = {
      encoder,
      pass,
      targetFormat: backend.renderTargetFormat,
      view: backend.view,
      stencilEnabled,
      stencilRef: this._stencilRef,
    };

    return this._active;
  }

  /** End and submit the active GPU pass, if any. Idempotent. */
  public endPass(): void {
    const active = this._active;

    if (active === null) {
      return;
    }

    this._active = null;
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

    this.beginPass(descriptor);

    try {
      body();
    } finally {
      // setRenderTarget flushes the active renderer on change, which self-closes
      // its GPU pass, so the child's draws are committed into the child target
      // before the bind switches back.
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
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
