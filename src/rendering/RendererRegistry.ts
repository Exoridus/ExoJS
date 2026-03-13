import type { Drawable } from './Drawable';
import type { SceneRenderRuntime } from './SceneRenderRuntime';
import type { Renderer, DrawableConstructor } from './RendererContract';

/**
 * Instance-based renderer registry.
 *
 * Maps drawable constructors to renderer instances. Each drawable type
 * has exactly one renderer. The registry manages connect/disconnect
 * lifecycle for all registered renderers.
 *
 * Resolution walks the prototype chain so sprite-backed subclasses such
 * as Text and Video can intentionally reuse the Sprite renderer.
 *
 * Used internally by backend managers. Exposed publicly for advanced
 * custom renderer registration.
 */
export class RendererRegistry<Runtime extends SceneRenderRuntime> {

    private readonly _renderers = new Map<DrawableConstructor, Renderer<Runtime, Drawable>>();
    private _runtime: Runtime | null = null;

    /**
     * Register a renderer for a specific drawable type.
     *
     * If the registry is already connected to a runtime, the renderer
     * is connected immediately. Registration must happen before the
     * first draw call for the given drawable type.
     *
     * @throws Error if a renderer is already registered for this drawable type.
     */
    public registerRenderer<Target extends Drawable>(
        drawableType: DrawableConstructor<Target>,
        renderer: Renderer<Runtime, Target>,
    ): void {
        if (this._renderers.has(drawableType)) {
            throw new Error(`A renderer is already registered for ${drawableType.name}.`);
        }

        // Widen TDrawable to Drawable for storage. Safe because the map key
        // guarantees the correct drawable type is always paired at lookup.
        this._renderers.set(drawableType, renderer as Renderer<Runtime, Drawable>);

        if (this._runtime !== null) {
            (renderer as Renderer<Runtime, Drawable>).connect(this._runtime);
        }
    }

    public resolve(drawable: Drawable): Renderer<Runtime, Drawable> {
        let constructor = drawable.constructor as DrawableConstructor | null;
        let renderer: Renderer<Runtime, Drawable> | undefined = undefined;

        while (constructor !== null && !renderer) {
            renderer = this._renderers.get(constructor);

            if (!renderer) {
                const prototype = Object.getPrototypeOf(constructor.prototype) as { constructor?: DrawableConstructor } | null;

                constructor = prototype?.constructor ?? null;
            }
        }

        if (!renderer) {
            throw new Error(
                `No renderer registered for ${drawable.constructor.name}. `
                + 'Register one with registry.registerRenderer() before the first draw call.',
            );
        }

        return renderer;
    }

    /**
     * Connect all registered renderers to the given runtime.
     */
    public connect(runtime: Runtime): void {
        this._runtime = runtime;

        for (const renderer of this._renderers.values()) {
            renderer.connect(runtime);
        }
    }

    /**
     * Disconnect all registered renderers from the current runtime.
     */
    public disconnect(): void {
        for (const renderer of this._renderers.values()) {
            renderer.disconnect();
        }

        this._runtime = null;
    }

    /**
     * Disconnect all registered renderers and clear the registry.
     */
    public destroy(): void {
        this.disconnect();

        for (const renderer of this._renderers.values()) {
            if ('destroy' in renderer && typeof renderer.destroy === 'function') {
                (renderer as Renderer<Runtime, Drawable> & { destroy(): void; }).destroy();
            }
        }

        this._renderers.clear();
    }
}
