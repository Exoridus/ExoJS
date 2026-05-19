import type { RenderBackend } from './RenderBackend';

/**
 * A single node in the render graph.
 *
 * Concrete implementations include {@link CallbackRenderPass} for arbitrary
 * draw logic and {@link RenderTargetPass} for off-screen rendering to a
 * {@link RenderTarget}. Passes are executed in order each frame by the backend.
 * @advanced
 */
export interface RenderPass {
  /** Execute this pass, issuing draw calls through `backend`. */
  execute(backend: RenderBackend): void;
}
