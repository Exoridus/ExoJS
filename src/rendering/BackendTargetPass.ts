import type { Color } from '#core/Color';
import type { RenderPassCoordinatorHost } from '#rendering/pass/RenderPassCoordinator';
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
  private readonly _callback: (backend: RenderBackend) => void;
  private readonly _target: RenderTarget | null;
  private readonly _view: View | null;
  private readonly _clearColor: Color | null;

  public constructor(callback: (backend: RenderBackend) => void, options: BackendTargetPassOptions = {}) {
    this._callback = callback;
    this._target = options.target ?? null;
    this._view = options.view ?? null;
    this._clearColor = options.clearColor ?? null;
  }

  public execute(backend: RenderBackend): void {
    const coordinator = (backend as RenderBackend & Partial<RenderPassCoordinatorHost>)._passCoordinator;

    if (coordinator) {
      coordinator.withChildPass(
        {
          target: this._target,
          view: this._view,
          load: this._clearColor !== null ? 'clear' : 'load',
          clearColor: this._clearColor,
          stencil: StencilAttachmentMode.None,
        },
        () => {
          this._callback(backend);
        },
      );

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
