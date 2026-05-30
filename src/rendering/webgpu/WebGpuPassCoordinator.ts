import type { Color } from '@/core/Color';
import type { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';

import type { Geometry } from '../geometry/Geometry';
import type { RenderPassCoordinator } from '../pass/RenderPassCoordinator';
import { type RenderPassDescriptor, type RenderPassLoad, StencilAttachmentMode } from '../pass/RenderPassDescriptor';
import type { RenderTarget } from '../RenderTarget';
import type { View } from '../View';

/**
 * The minimal surface of {@link WebGpuBackend} the coordinator drives. Declared
 * structurally so the coordinator is decoupled from the backend class and is
 * unit-testable with a mock — no GPU device required.
 * @internal
 */
export interface WebGpuPassBackend {
  readonly renderTarget: RenderTarget;
  readonly view: View;
  setRenderTarget(target: RenderTarget | null): unknown;
  setView(view: View | null): unknown;
  clear(color?: Color): unknown;
  flush(): unknown;
  pushScissorRect(bounds: Rectangle): unknown;
  popScissorRect(): unknown;
  pushStencilClip(shape: Geometry, transform: Matrix): unknown;
  popStencilClip(): unknown;
  /** Whether `target` already holds rendered content this frame. */
  _targetHasContent(target: RenderTarget): boolean;
}

/**
 * WebGPU implementation of {@link RenderPassCoordinator} (phase 12C).
 *
 * It owns the canonical clear-vs-load decision ({@link resolveLoad}) — a render
 * texture's contents must survive across multiple passes in a frame — and
 * provides thin target / view / clear / scissor delegators so the shared
 * orchestration paths (RenderTargetPass, RenderingContext.renderTo) route
 * through it uniformly. It does not yet own the `GPURenderPassEncoder`; that
 * ownership moves here in phase 12D.
 * @internal
 */
export class WebGpuPassCoordinator implements RenderPassCoordinator {
  private readonly _backend: WebGpuPassBackend;
  private _stencilEnabled = false;

  public constructor(backend: WebGpuPassBackend) {
    this._backend = backend;
  }

  public get activeTarget(): RenderTarget {
    return this._backend.renderTarget;
  }

  public get activeView(): View {
    return this._backend.view;
  }

  // The backend always has a bound logical target; the GPU pass itself is opened
  // lazily per submit until 12D moves that ownership here.
  public readonly hasActivePass = true;

  public beginPass(descriptor: RenderPassDescriptor): void {
    this._backend.setRenderTarget(descriptor.target);
    this._backend.setView(descriptor.view);
    this._stencilEnabled = descriptor.stencil === StencilAttachmentMode.Enabled;

    if (descriptor.load === 'clear') {
      this._backend.clear(descriptor.clearColor ?? undefined);
    }
  }

  public endPass(): void {
    this._backend.flush();
  }

  public withChildPass(descriptor: RenderPassDescriptor, body: () => void): void {
    const previousTarget = this._backend.renderTarget;
    const previousView = this._backend.view;
    const previousStencilEnabled = this._stencilEnabled;

    this.beginPass(descriptor);

    try {
      body();
    } finally {
      // setRenderTarget flushes the active renderer on change, so the child's
      // draws are committed into the child target before the bind switches back.
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
