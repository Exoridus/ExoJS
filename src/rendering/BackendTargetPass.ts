import type { Color } from '#core/Color';
import type { Mutable } from '#core/types';
import type { RenderPassCoordinatorHost } from '#rendering/pass/RenderPassCoordinator';
import type { RenderPassDescriptor } from '#rendering/pass/RenderPassDescriptor';
import { StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';

import type { BackendRenderPass } from './BackendRenderPass';
import type { RenderBackend } from './RenderBackend';
import type { RenderTarget } from './RenderTarget';
import type { View } from './View';

/**
 * Configuration options for {@link BackendTargetPass}.
 * @internal
 */
export interface BackendTargetPassOptions {
  /** Render target to draw into. `null` or omitted redirects output to the default framebuffer. */
  readonly target?: RenderTarget | null;
  /** {@link View} to use while executing this pass. Falls back to the backend's active view when omitted. */
  readonly view?: View | null;
  /** If provided, the target is cleared to this colour before the callback runs. */
  readonly clearColor?: Color;
}

/**
 * A {@link BackendRenderPass} that redirects rendering into an off-screen {@link RenderTarget}.
 *
 * Saves the current render target and view before executing the callback, then restores them afterwards —
 * even if the callback throws. This makes it safe to nest passes or use in try/finally chains without manual
 * cleanup.
 *
 * Engine-internal target-redirect primitive: used by the stock filters, `RenderNode`'s bitmap/cache capture,
 * and the high-level `RenderNodePass` / `CallbackRenderPass` `{ target }` redirect. Not part of the public
 * surface — high-level code sets `{ target }` on a leaf pass instead.
 * @internal
 */
export class BackendTargetPass implements BackendRenderPass {
  private _callback: (backend: RenderBackend) => void;
  private _target: RenderTarget | null;
  private _view: View | null;
  private _clearColor: Color | null;

  /**
   * The descriptor handed to the coordinator, rewritten in place per execute.
   *
   * The coordinator reads it synchronously inside `withChildPass` and keeps no
   * reference, so one instance per pass is enough. It matters because the
   * effect path executes a pass per capture and per filter — a hundred filtered
   * nodes is two hundred descriptors a frame, for a shape that never varies.
   */
  private readonly _descriptor: Mutable<RenderPassDescriptor> = {
    target: null,
    view: null,
    load: 'load',
    clearColor: null,
    stencil: StencilAttachmentMode.None,
  };

  /**
   * The pass body, allocated ONCE per pass rather than per execute.
   *
   * `withChildPass` takes a `() => void`, and the obvious inline arrow closes
   * over `backend` — a fresh closure and its context on every execute, on the
   * hottest effect path there is. Staging the backend on the instance instead
   * lets one bound function serve every call. Not reentrant, which costs
   * nothing: a pass cannot be executing inside itself.
   */
  private readonly _runCallback = (): void => {
    this._callback(this._activeBackend!);
  };

  private _activeBackend: RenderBackend | null = null;

  public constructor(callback: (backend: RenderBackend) => void, options: BackendTargetPassOptions = {}) {
    this._callback = callback;
    this._target = options.target ?? null;
    this._view = options.view ?? null;
    this._clearColor = options.clearColor ?? null;
  }

  /**
   * Re-point this pass at a different body, target, view and clear colour.
   *
   * For callers that execute a target redirect every frame — the stock filters
   * and `RenderNode`'s capture/composite — so they can hold ONE pass instead of
   * constructing one per frame. A caller that configures a pass once still just
   * uses the constructor.
   */
  public reconfigure(callback: (backend: RenderBackend) => void, target: RenderTarget | null, view: View | null, clearColor: Color | null): this {
    this._callback = callback;

    return this.retarget(target, view, clearColor);
  }

  /**
   * Re-point this pass at a different target, view and clear colour, keeping
   * its body. The stock filters draw the same sprite every time and only the
   * output target moves, so they never need to touch the callback.
   */
  public retarget(target: RenderTarget | null, view: View | null, clearColor: Color | null): this {
    this._target = target;
    this._view = view;
    this._clearColor = clearColor;

    return this;
  }

  public execute(backend: RenderBackend): void {
    const coordinator = (backend as RenderBackend & Partial<RenderPassCoordinatorHost>)._passCoordinator;

    if (coordinator) {
      const descriptor = this._descriptor;
      const previousBackend = this._activeBackend;

      descriptor.target = this._target;
      descriptor.view = this._view;
      descriptor.load = this._clearColor !== null ? 'clear' : 'load';
      descriptor.clearColor = this._clearColor;
      this._activeBackend = backend;

      try {
        coordinator.withChildPass(descriptor, this._runCallback);
      } finally {
        this._activeBackend = previousBackend;
      }

      return;
    }

    // Legacy fallback for backends without a pass coordinator (e.g. test stubs):
    // save the target/view, run the callback, then restore — even if it throws.
    const previousTarget = backend.renderTarget;
    const previousView = backend.view;

    backend.setRenderTarget(this._target);
    backend.setView(this._view);

    if (this._clearColor !== null) {
      backend.clear(this._clearColor);
    }

    try {
      this._callback(backend);
    } finally {
      backend.setRenderTarget(previousTarget);
      backend.setView(previousView);
    }
  }
}
