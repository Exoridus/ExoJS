import type { RenderBackend } from './RenderBackend';

/**
 * A low-level, backend-only render command. Implement this for custom passes that need direct
 * {@link RenderBackend} access (custom shaders, backend-specific draw logic), and run it via
 * {@link RenderBackend.execute}.
 *
 * This is the advanced escape hatch beneath the high-level, context-aware render-pass tree. It receives the
 * backend (no camera) and is not a frame phase. High-level code composes `RenderPass` objects in a
 * `RenderPipeline` instead; to run a `BackendRenderPass` inside a pipeline, bridge it from a
 * `CallbackRenderPass` (`context.backend.execute(myBackendPass)`).
 * @advanced
 */
export interface BackendRenderPass {
  /** Execute this pass, issuing draw calls through `backend`. */
  execute(backend: RenderBackend): void;
}
