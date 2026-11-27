/// <reference types="@webgpu/types" />

import type { Drawable } from '#rendering/Drawable';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';

import type { WebGpuBackend } from './WebGpuBackend';

/**
 * Base class for WebGPU renderers.
 *
 * Manages the connect/disconnect lifecycle and provides a safe
 * `getBackend()` accessor that throws if the renderer is not connected.
 *
 * Subclasses must implement:
 * - onConnect(backend): set up GPU resources (shader modules, pipelines, buffers)
 * - onDisconnect(): tear down GPU resources
 * - render(drawable): collect draw call data for the given drawable
 * - flush(): encode and submit command buffers for all collected draw calls
 *
 * `connect()` binds the first backend only: while unconnected, a backend of
 * another type throws; a second call while connected is a no-op regardless of
 * its type. `disconnect()` flushes and runs `onDisconnect()` before unbinding;
 * unbinding completes even if either hook throws. A failed connection can be retried.
 */
export abstract class AbstractWebGpuRenderer<Target extends Drawable> implements Renderer<WebGpuBackend, Target> {
  public readonly backendType = RenderBackendType.WebGpu;

  protected _backend: WebGpuBackend | null = null;

  public connect(backend: WebGpuBackend): void {
    if (this._backend !== null) {
      return;
    }

    if (backend.backendType !== RenderBackendType.WebGpu) {
      throw new Error(`${this.constructor.name} requires a WebGPU backend, ` + `but received backendType ${String(backend.backendType)}.`);
    }

    this._backend = backend;

    try {
      this.onConnect(backend);
    } catch (error) {
      try {
        this.onDisconnect();
      } finally {
        this._backend = null;
      }

      throw error;
    }
  }

  public disconnect(): void {
    if (this._backend === null) {
      return;
    }

    try {
      this.flush();
    } finally {
      try {
        this.onDisconnect();
      } finally {
        this._backend = null;
      }
    }
  }

  public abstract render(drawable: Target): void;
  public abstract flush(): void;

  protected abstract onConnect(backend: WebGpuBackend): void;
  protected abstract onDisconnect(): void;

  protected getBackend(): WebGpuBackend {
    if (this._backend === null) {
      throw new Error(`${this.constructor.name} is not connected to a backend.`);
    }

    return this._backend;
  }

  protected getBackendOrNull(): WebGpuBackend | null {
    return this._backend;
  }
}
