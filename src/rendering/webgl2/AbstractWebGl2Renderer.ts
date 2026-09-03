import type { Drawable } from '#rendering/Drawable';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';

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
 *
 * Backend state ownership: GL state is global and every renderer shares it, so
 * a renderer must establish the state it draws with immediately before its own
 * draw call - another renderer, a compositor, or a retained replay may have
 * changed it since the batch started accumulating. `setBlendMode`,
 * `bindTexture`, `bindShader` and `bindVertexArrayObject` compare against the
 * live state themselves and collapse a redundant call, so calling them
 * unconditionally costs a comparison. Do not mirror backend state in the
 * renderer to suppress those calls: a private copy is a batch-break signal at
 * most and must not outlive the flush that ends its batch. Skipping a bind also
 * skips the upload the backend performs there, which is the only thing that
 * carries a texture whose payload changed under a stable identity to the GPU.
 */
export abstract class AbstractWebGl2Renderer<Target extends Drawable> implements Renderer<WebGl2Backend, Target> {
  public readonly backendType = RenderBackendType.WebGl2;

  private _backend: WebGl2Backend | null = null;

  public connect(backend: WebGl2Backend): void {
    if (this._backend !== null) {
      return;
    }

    if (backend.backendType !== RenderBackendType.WebGl2) {
      throw new Error(`${this.constructor.name} requires a WebGL2 backend, ` + `but received backendType ${String(backend.backendType)}.`);
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
