import type { Time } from '@/core/Time';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { Application } from '@/core/Application';

/**
 * Base class for a debug layer. Subclasses build a screen-space visual
 * (text, outlines, etc.) that the DebugOverlay renders each frame when
 * `visible` is true. Tree-shake-able via the @codexo/exojs/debug subpath.
 */
export abstract class DebugLayer {
    public visible: boolean = false;

    public constructor(protected readonly _app: Application) {}

    /** Update internal state from this frame's data. Called only when visible. */
    public abstract update(delta: Time): void;

    /**
     * Render the layer's content using the backend. The DebugOverlay sets a
     * screen-space view before calling this; restore is handled by the overlay.
     * Called only when visible.
     */
    public abstract render(backend: RenderBackend): void;

    public destroy(): void {
        // Default: nothing. Subclasses override to release Container subtrees etc.
    }
}
