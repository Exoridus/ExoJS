import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';
import type { RenderBackendType } from './RenderBackendType';

/**
 * Contract for a type-specific GPU renderer.
 *
 * One renderer instance exists per drawable type (e.g. `SpriteRenderer`,
 * `MeshRenderer`). Renderers are registered with {@link RendererRegistry} and
 * resolved at draw time. They manage their own GPU resources and expose a
 * `flush` method to submit batched draw calls.
 *
 * @typeParam Runtime - The concrete {@link RenderBackend} the renderer targets.
 * @typeParam Target  - The {@link Drawable} subtype this renderer handles.
 */
export interface Renderer<Runtime extends RenderBackend = RenderBackend, Target extends Drawable = Drawable> {
  readonly backendType: RenderBackendType;

  /** Acquire GPU resources from `backend` and prepare for rendering. */
  connect(backend: Runtime): void;
  /** Release all GPU resources held by this renderer. */
  disconnect(): void;
  /** Record a single drawable into the current batch. */
  render(drawable: Target): void;
  /** Submit all batched draw calls to the GPU. */
  flush(): void;
}

/**
 * Constructor type used as a registry key for drawable-to-renderer mapping.
 * Supports both concrete and abstract drawable classes.
 */
export type DrawableConstructor<Target extends Drawable = Drawable> = abstract new (...args: never[]) => Target;
