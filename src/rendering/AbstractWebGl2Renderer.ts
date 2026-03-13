import { RenderBackendType } from './RenderBackendType';
import type { Drawable } from './Drawable';
import type { Renderer } from './RendererContract';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';

/**
 * Base class for WebGL2 renderers.
 *
 * Manages the connect/disconnect lifecycle and provides a safe
 * `getRuntime()` accessor that throws if the renderer is not connected.
 *
 * Subclasses must implement:
 * - onConnect(runtime): set up GL resources
 * - onDisconnect(): tear down GL resources
 * - render(drawable): batch or immediately draw the given drawable
 * - flush(): submit any batched draw calls to the GPU
 */
export abstract class AbstractWebGl2Renderer<Target extends Drawable> implements Renderer<WebGl2RendererRuntime, Target> {

    public readonly backendType = RenderBackendType.WebGl2;

    private _runtime: WebGl2RendererRuntime | null = null;

    public connect(runtime: WebGl2RendererRuntime): void {
        if (this._runtime !== null) {
            return;
        }

        if (runtime.backendType !== RenderBackendType.WebGl2) {
            throw new Error(
                `${this.constructor.name} requires a WebGL2 runtime, `
                + `but received backendType ${String(runtime.backendType)}.`,
            );
        }

        this._runtime = runtime;
        this.onConnect(runtime);
    }

    public disconnect(): void {
        if (this._runtime === null) {
            return;
        }

        this.flush();
        this.onDisconnect();
        this._runtime = null;
    }

    public abstract render(drawable: Target): void;
    public abstract flush(): void;

    /**
     * Called once when the renderer is first connected to a runtime.
     * Subclasses create GL resources here.
     */
    protected abstract onConnect(runtime: WebGl2RendererRuntime): void;

    /**
     * Called when the renderer is disconnected from its runtime.
     * Subclasses tear down GL resources here.
     */
    protected abstract onDisconnect(): void;

    /**
     * Safe accessor for the connected runtime.
     * @throws Error if the renderer is not connected.
     */
    protected getRuntime(): WebGl2RendererRuntime {
        if (this._runtime === null) {
            throw new Error(`${this.constructor.name} is not connected to a runtime.`);
        }

        return this._runtime;
    }

    /**
     * Returns the connected runtime, or null if not connected.
     * Use this for conditional checks where disconnected state is expected.
     */
    protected getRuntimeOrNull(): WebGl2RendererRuntime | null {
        return this._runtime;
    }
}
