import type { Color } from '@/core/Color';
import type { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';

import type { Geometry } from '../geometry/Geometry';
import type { RenderPassCoordinator } from '../pass/RenderPassCoordinator';
import { type RenderPassDescriptor, type RenderPassLoad, StencilAttachmentMode } from '../pass/RenderPassDescriptor';
import type { RenderTarget } from '../RenderTarget';
import type { View } from '../View';

/**
 * The minimal surface of {@link WebGl2Backend} that the coordinator drives.
 * Declared structurally so the coordinator stays decoupled from the (large)
 * backend class and is trivially unit-testable with a mock — no GL context
 * required.
 * @internal
 */
export interface WebGl2PassBackend {
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
}

/**
 * WebGL2 implementation of {@link RenderPassCoordinator}.
 *
 * WebGL2 render-pass behaviour is ambient GL state — a bound framebuffer,
 * viewport, scissor and stencil state — so this coordinator is a thin adapter
 * over the backend's existing state-transition methods. It owns no GPU pass
 * object: "begin a pass" means set target + view (+ clear); "end a pass" means
 * flush the active renderer.
 *
 * Inline stencil clips delegate straight to the backend's stencil stack and
 * never count as a render pass — no {@link BackendTargetPass}, no `renderPasses`
 * stat — matching the existing inline scissor / stencil behaviour.
 * @internal
 */
export class WebGl2PassCoordinator implements RenderPassCoordinator {
  private readonly _backend: WebGl2PassBackend;
  private _stencilEnabled = false;

  public constructor(backend: WebGl2PassBackend) {
    this._backend = backend;
  }

  public get activeTarget(): RenderTarget {
    return this._backend.renderTarget;
  }

  public get activeView(): View {
    return this._backend.view;
  }

  // WebGL2 always has an ambient bound target, so a pass is always "active".
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
      // The 10a flush-order fix makes setRenderTarget flush the child batch into
      // the child target before the bind switches back, so no manual flush is
      // needed here to keep the child's draws out of the restored target.
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

  public resolveLoad(_target: RenderTarget, clearRequested: boolean): RenderPassLoad {
    // WebGL2 framebuffer contents persist across binds, so "load" is the natural
    // default; only an explicit clear request forces a clear.
    return clearRequested ? 'clear' : 'load';
  }
}
