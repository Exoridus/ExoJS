import { RenderBackendType } from '../RenderBackendType';
import type { Drawable } from '../Drawable';
import type { Renderer } from '../Renderer';
import type { WebGl2Backend } from './WebGl2Backend';

/**
 * Base class for WebGL2 renderers.
 *
 * Manages the connect/disconnect lifecycle and provides a safe
 * `getBackend()` accessor that throws if the renderer is not connected.
 *
 * Subclasses must implement:
 * - onConnect(backend): set up GL resources
 * - onDisconnect(): tear down GL resources
 * - render(drawable): batch or immediately draw the given drawable
 * - flush(): submit any batched draw calls to the GPU
 */
export abstract class AbstractWebGl2Renderer<Target extends Drawable> implements Renderer<WebGl2Backend, Target> {

    public readonly backendType = RenderBackendType.WebGl2;

    private _backend: WebGl2Backend | null = null;

    public connect(backend: WebGl2Backend): void {
        if (this._backend !== null) {
            return;
        }

        if (backend.backendType !== RenderBackendType.WebGl2) {
            throw new Error(
                `${this.constructor.name} requires a WebGL2 backend, `
                + `but received backendType ${String(backend.backendType)}.`,
            );
        }

        this._backend = backend;
        this.onConnect(backend);
    }

    public disconnect(): void {
        if (this._backend === null) {
            return;
        }

        this.flush();
        this.onDisconnect();
        this._backend = null;
    }

    public abstract render(drawable: Target): void;
    public abstract flush(): void;

    /**
     * Called once when the renderer is first connected to a backend.
     * Subclasses create GL resources here.
     */
    protected abstract onConnect(backend: WebGl2Backend): void;

    /**
     * Called when the renderer is disconnected from its backend.
     * Subclasses tear down GL resources here.
     */
    protected abstract onDisconnect(): void;

    /**
     * Safe accessor for the connected backend.
     * @throws Error if the renderer is not connected.
     */
    protected getBackend(): WebGl2Backend {
        if (this._backend === null) {
            throw new Error(`${this.constructor.name} is not connected to a backend.`);
        }

        return this._backend;
    }

    /**
     * Returns the connected backend, or null if not connected.
     * Use this for conditional checks where disconnected state is expected.
     */
    protected getBackendOrNull(): WebGl2Backend | null {
        return this._backend;
    }
}
