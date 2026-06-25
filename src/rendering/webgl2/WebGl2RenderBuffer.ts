import type { TypedArray } from '#core/types';
import { emptyArrayBuffer } from '#core/utils';
import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { BufferTypes, BufferUsage } from '#rendering/types';

type DataContainer = ArrayBuffer | SharedArrayBuffer | ArrayBufferView | TypedArray;

export interface WebGl2RenderBufferRuntime {
  bind(buffer: WebGl2RenderBuffer): void;
  upload(buffer: WebGl2RenderBuffer, offset: number): void;
  destroy(buffer: WebGl2RenderBuffer): void;
}

/**
 * Backend-agnostic GPU buffer descriptor. Holds the buffer type
 * (`ArrayBuffer` / `ElementArrayBuffer`), usage hint
 * (`Static` / `Dynamic` / `Stream`), the typed-array CPU-side data, and a
 * version counter so the runtime can detect mutations and re-upload
 * lazily. The actual `WebGLBuffer` lifecycle is managed by the runtime
 * binding via {@link WebGl2RenderBufferRuntime}.
 */
export class WebGl2RenderBuffer {
  private readonly _type: number;
  private readonly _usage: BufferUsage;
  private _runtime: WebGl2RenderBufferRuntime | null = null;
  private _data: DataContainer = emptyArrayBuffer;
  private _version = 0;
  private _accountant: GpuResourceAccountant | null = null;
  /**
   * High-water mark of GPU storage booked with the accountant. The runtime only
   * issues a fresh `bufferData` (storage reallocation) when the upload exceeds
   * the previously sized buffer, so storage tracks the largest byte length ever
   * uploaded; per-upload byte traffic is booked separately each call.
   */
  private _accountedBytes = 0;

  public constructor(type: BufferTypes, data: DataContainer, usage: BufferUsage) {
    this._type = type;
    this._usage = usage;

    if (data) {
      this.upload(data);
    }
  }

  public get type(): number {
    return this._type;
  }

  public get usage(): BufferUsage {
    return this._usage;
  }

  public get data(): DataContainer {
    return this._data;
  }

  public get version(): number {
    return this._version;
  }

  public connect(runtime: WebGl2RenderBufferRuntime, accountant?: GpuResourceAccountant): this {
    this._runtime = runtime;
    this._accountant = accountant ?? null;

    if (this._data.byteLength > 0) {
      runtime.upload(this, 0);
      this._bookUpload();
    }

    return this;
  }

  public disconnect(): this {
    this._runtime = null;

    return this;
  }

  public upload(data: DataContainer, offset = 0): void {
    this._data = data;
    this._version++;

    this._runtime?.upload(this, offset);
    this._bookUpload();
  }

  public bind(): void {
    this._runtime?.bind(this);
  }

  public destroy(): void {
    this._runtime?.destroy(this);
    this._runtime = null;

    if (this._accountedBytes > 0) {
      this._accountant?.free(this._accountedBytes);
      this._accountedBytes = 0;
    }
  }

  /**
   * Book the just-issued GPU upload with the resource accountant: the full
   * uploaded byte count as per-frame upload traffic, plus any growth of the
   * resident storage high-water mark as a (re)allocation.
   */
  private _bookUpload(): void {
    const accountant = this._accountant;

    if (accountant === null || this._runtime === null) {
      return;
    }

    const byteLength = this._data.byteLength;

    accountant.recordBufferUpload(byteLength);

    if (byteLength > this._accountedBytes) {
      this._accountedBytes = accountant.reallocate(this._accountedBytes, byteLength);
    }
  }
}
