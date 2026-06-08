import type { Application } from '#core/Application';
import type { Time } from '#core/Time';
import type { RenderBackend } from '#rendering/RenderBackend';

/**
 * Determines the coordinate space a {@link DebugLayer} renders into.
 * `'screen'` uses the overlay's pixel-space view; `'world'` uses the scene's
 * current world-space view and renders beneath screen-space panels.
 */
export type DebugLayerViewMode = 'screen' | 'world';

/**
 * Abstract base for a single diagnostic overlay layer. Subclasses produce a
 * visual (outlines, text panels, sparklines, etc.) that
 * {@link DebugOverlay} composites each frame when {@link visible} is `true`.
 *
 * Concrete layers are tree-shakeable via the `@codexo/exojs/debug` subpath
 * and are not loaded unless explicitly imported.
 */
export abstract class DebugLayer {
  public visible = false;

  public constructor(protected readonly _app: Application) {}

  /**
   * Whether this layer renders in the scene's world-space view or in a
   * screen-space (canvas-pixel) view. Defaults to 'screen'. Subclasses
   * override to return 'world' when rendering at actual scene positions.
   */
  public get viewMode(): DebugLayerViewMode {
    return 'screen';
  }

  /** Update internal state from this frame's data. Called only when visible. */
  public abstract update(delta: Time): void;

  /**
   * Render the layer's content using the backend. The DebugOverlay manages
   * the active view based on this layer's viewMode; restore is handled by the overlay.
   * Called only when visible.
   */
  public abstract render(backend: RenderBackend): void;

  /**
   * Release any scene-graph nodes or resources owned by this layer.
   * Called by {@link DebugOverlay.destroy}. The base implementation is a
   * no-op; subclasses override to tear down their {@link Container} subtrees.
   */
  public destroy(): void {
    // Default: nothing. Subclasses override to release Container subtrees etc.
  }
}
