import type { RenderBackendType } from './RenderBackendType';
import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';

export interface Renderer<
    Runtime extends RenderBackend = RenderBackend,
    Target extends Drawable = Drawable,
> {
    readonly backendType: RenderBackendType;

    connect(backend: Runtime): void;
    disconnect(): void;
    render(drawable: Target): void;
    flush(): void;
}

/**
 * Constructor type used as a registry key for drawable-to-renderer mapping.
 * Supports both concrete and abstract drawable classes.
 */
export type DrawableConstructor<Target extends Drawable = Drawable> = abstract new (...args: Array<never>) => Target;
