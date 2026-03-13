/// <reference types="@webgpu/types" />

import { RenderBackendType } from './RenderBackendType';
import type { Drawable } from './Drawable';
import type { Renderer } from './RendererContract';
import type { WebGpuRendererRuntime } from './WebGpuRendererRuntime';

/**
 * Base class for WebGPU renderers.
 *
 * Manages the connect/disconnect lifecycle and provides a safe
 * `getRuntime()` accessor that throws if the renderer is not connected.
 *
 * Subclasses must implement:
 * - onConnect(runtime): set up GPU resources (shader modules, pipelines, buffers)
 * - onDisconnect(): tear down GPU resources
 * - render(drawable): collect draw call data for the given drawable
 * - flush(): encode and submit command buffers for all collected draw calls
 */
export abstract class AbstractWebGpuRenderer<Target extends Drawable> implements Renderer<WebGpuRendererRuntime, Target> {

    public readonly backendType = RenderBackendType.WebGpu;

    private _runtime: WebGpuRendererRuntime | null = null;

    public connect(runtime: WebGpuRendererRuntime): void {
        if (this._runtime !== null) {
            return;
        }

        if (runtime.backendType !== RenderBackendType.WebGpu) {
            throw new Error(
                `${this.constructor.name} requires a WebGPU runtime, `
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

    protected abstract onConnect(runtime: WebGpuRendererRuntime): void;
    protected abstract onDisconnect(): void;

    protected getRuntime(): WebGpuRendererRuntime {
        if (this._runtime === null) {
            throw new Error(`${this.constructor.name} is not connected to a runtime.`);
        }

        return this._runtime;
    }

    protected getRuntimeOrNull(): WebGpuRendererRuntime | null {
        return this._runtime;
    }
}
