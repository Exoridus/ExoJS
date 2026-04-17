import type { RenderBackendType } from './RenderBackendType';
import type { Drawable } from './Drawable';
import type { SceneRenderRuntime } from './SceneRenderRuntime';

export interface Renderer<
    Runtime extends SceneRenderRuntime = SceneRenderRuntime,
    Target extends Drawable = Drawable,
> {
    readonly backendType: RenderBackendType;

    connect(runtime: Runtime): void;
    disconnect(): void;
    render(drawable: Target): void;
    flush(): void;
}

/**
 * Constructor type used as a registry key for drawable-to-renderer mapping.
 * Supports both concrete and abstract drawable classes.
 */
export type DrawableConstructor<Target extends Drawable = Drawable> = abstract new (...args: Array<never>) => Target;
