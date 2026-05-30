/// <reference types="@webgpu/types" />

import type { Color } from '@/core/Color';
import type { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';

import type { Geometry } from '../geometry/Geometry';
import type { RenderPassCoordinator } from '../pass/RenderPassCoordinator';
import { type RenderPassDescriptor, type RenderPassLoad, StencilAttachmentMode } from '../pass/RenderPassDescriptor';
import type { RenderStats } from '../RenderStats';
import type { RenderTarget } from '../RenderTarget';
import type { View } from '../View';

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
}

/**
 * The minimal surface of {@link WebGpuBackend} the coordinator drives. Declared
 * structurally so the coordinator is decoupled from the backend class and is
 * unit-testable with a mock — no GPU device required for the `resolveLoad`
 * surface (the `acquirePass` surface needs a device).
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
  pushStencilClip(shape: Geometry, transform: Matrix): unknown;
  popStencilClip(): unknown;
  createColorAttachment(): GPURenderPassColorAttachment;
  getScissorRect(): ScissorRect | null;
  submit(commandBuffer: GPUCommandBuffer): void;
  /** Whether `target` already holds rendered content this frame. */
  _targetHasContent(target: RenderTarget): boolean;
}

/**
 * WebGPU implementation of {@link RenderPassCoordinator}.
 *
 * Owns the GPU render-pass mechanics: `acquirePass` lazily opens a command
 * encoder + `GPURenderPassEncoder` for the backend's current target/view
 * (resolving load/clear and applying the active scissor), and `endPass` ends
 * and submits it. Renderers / the mask compositor / shader filters record their
 * draws into `acquirePass().pass` and call `endPass` instead of creating and
 * submitting their own command buffers, so render-pass ownership lives in one
 * place — the prerequisite for sharing a stencil attachment across a clip
 * scope (phase 12E).
 *
 * Each `acquirePass` is paired with an `endPass` inside the same synchronous
 * flush, so no pass ever spans backend operations; submit count is unchanged.
 *
 * Also owns the canonical clear-vs-load decision ({@link resolveLoad}) and the
 * thin target/view/clear/scissor delegators used by the shared orchestration
 * paths (RenderTargetPass, RenderingContext.renderTo).
 * @internal
 */
export class WebGpuPassCoordinator implements RenderPassCoordinator {
  private readonly _backend: WebGpuPassBackend;
  private _stencilEnabled = false;
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
   * Open (or return the already-open) GPU render pass for the backend's current
   * target/view. Resolves load/clear via {@link createColorAttachment}, counts
   * the pass, and applies the active scissor rectangle.
   */
  public acquirePass(): WebGpuActiveRenderPass {
    if (this._active !== null) {
      return this._active;
    }

    const backend = this._backend;
    const encoder = backend.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [backend.createColorAttachment()],
    });

    backend.stats.renderPasses++;

    const scissor = backend.getScissorRect();

    if (scissor !== null && scissor.width > 0 && scissor.height > 0) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
    }

    this._active = {
      encoder,
      pass,
      targetFormat: backend.renderTargetFormat,
      view: backend.view,
      stencilEnabled: this._stencilEnabled,
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
    this._stencilEnabled = descriptor.stencil === StencilAttachmentMode.Enabled;

    if (descriptor.load === 'clear') {
      this._backend.clear(descriptor.clearColor ?? undefined);
    }
  }

  public withChildPass(descriptor: RenderPassDescriptor, body: () => void): void {
    const previousTarget = this._backend.renderTarget;
    const previousView = this._backend.view;
    const previousStencilEnabled = this._stencilEnabled;

    this.beginPass(descriptor);

    try {
      body();
    } finally {
      // setRenderTarget flushes the active renderer on change, which self-closes
      // its GPU pass, so the child's draws are committed into the child target
      // before the bind switches back.
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
      this._stencilEnabled = previousStencilEnabled;
    }
  }

  public pushScissorRect(bounds: Rectangle): void {
    this._backend.pushScissorRect(bounds);
  }

  public popScissorRect(): void {
    this._backend.popScissorRect();
  }

  public pushStencilClip(shape: Geometry, transform: Matrix): void {
    this._backend.pushStencilClip(shape, transform);
  }

  public popStencilClip(): void {
    this._backend.popStencilClip();
  }

  public resolveLoad(target: RenderTarget, clearRequested: boolean): RenderPassLoad {
    // Clear when explicitly requested or when the target holds no content to
    // preserve; otherwise load, so a render texture keeps its prior contents
    // across multiple passes in the same frame.
    return clearRequested || !this._backend._targetHasContent(target) ? 'clear' : 'load';
  }
}
