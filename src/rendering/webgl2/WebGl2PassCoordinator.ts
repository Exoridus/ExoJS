import { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { RenderPassCoordinator } from '#rendering/pass/RenderPassCoordinator';
import { type RenderPassDescriptor, type RenderPassLoad, StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';
import type { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

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
  /**
   * Scratch colour used only to restore the clear colour after a child pass.
   * One per coordinator rather than one per pass: child passes nest, but each
   * level holds its own four channel values in locals and restores
   * innermost-first, so a single instance is never read across levels.
   */
  private readonly _clearColorScratch = new Color();

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
      // The 10a flush-order fix makes setRenderTarget flush the child batch into
      // the child target before the bind switches back, so no manual flush is
      // needed here to keep the child's draws out of the restored target.
      this._backend.setRenderTarget(previousTarget);
      this._backend.setView(previousView);
      this._stencilEnabled = previousStencilEnabled;
      this._backend.setClearColor(this._clearColorScratch.set(previousR, previousG, previousB, previousA));
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
