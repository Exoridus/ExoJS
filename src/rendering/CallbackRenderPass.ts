import type { BackendRenderPass } from './BackendRenderPass';
import type { RenderBackend } from './RenderBackend';

/**
 * A {@link BackendRenderPass} that delegates its execution to a user-supplied callback.
 * Use this as a lightweight alternative to a full renderer class when custom
 * draw logic needs to participate in the render graph without a dedicated type.
 *
 * @example
 * ```ts
 * new CallbackRenderPass((backend) => {
 *     backend.draw(myDrawable);
 * });
 * ```
 * @advanced
 */
export class CallbackRenderPass implements BackendRenderPass {
  private readonly _callback: (backend: RenderBackend) => void;

  public constructor(callback: (backend: RenderBackend) => void) {
    this._callback = callback;
  }

  public execute(backend: RenderBackend): void {
    this._callback(backend);
  }
}
