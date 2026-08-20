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

/** `elementCount` value meaning "upload all of `data`". @internal */
const wholeBuffer = -1;

/**
 * Byte size of one element of `data`. `BYTES_PER_ELEMENT` is present on every
 * typed array; a `DataView` or raw buffer has no element type, so a partial
 * upload from one is counted in bytes.
 */
const bytesPerElementOf = (data: DataContainer): number => (data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;

/**
 * Issue the buffer's pending upload as an in-place `bufferSubData` at
 * `byteOffset`. Honours a partial {@link WebGl2RenderBuffer.upload} range via
 * WebGL2's `(srcData, srcOffset, length)` overload, so a caller that uploads
 * the filled prefix of a persistent scratch array does not have to materialize
 * a `subarray()` view to express the length. Every runtime must go through this
 * (and {@link uploadBufferStore}) rather than calling `gl` directly - a direct
 * call would silently upload the whole array for a partial range.
 * @internal
 */
export const uploadBufferRange = (gl: WebGL2RenderingContext, buffer: WebGl2RenderBuffer, byteOffset: number): void => {
  const { data, uploadElementCount } = buffer;

  if (uploadElementCount === wholeBuffer) {
    gl.bufferSubData(buffer.type, byteOffset, data as ArrayBuffer);

    return;
  }

  gl.bufferSubData(buffer.type, byteOffset, data as ArrayBufferView, 0, uploadElementCount);
};

/**
 * (Re)allocate the buffer's GPU store from its pending upload - the orphaning
 * `bufferData` counterpart to {@link uploadBufferRange}. The store is sized to
 * the uploaded RANGE, exactly as a `subarray()` argument used to size it.
 * @internal
 */
export const uploadBufferStore = (gl: WebGL2RenderingContext, buffer: WebGl2RenderBuffer): void => {
  const { data, uploadElementCount } = buffer;

  if (uploadElementCount === wholeBuffer) {
    gl.bufferData(buffer.type, data as ArrayBuffer, buffer.usage);

    return;
  }

  gl.bufferData(buffer.type, data as ArrayBufferView, buffer.usage, 0, uploadElementCount);
};

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
  /**
   * Elements of {@link _data} the pending upload covers, counted from index 0,
   * or {@link wholeBuffer} for all of it. Lets a caller upload the filled prefix
   * of a persistent scratch array without allocating a `subarray()` view per
   * upload just to carry the length.
   */
  private _uploadElementCount = wholeBuffer;
  private _uploadByteLength = 0;
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

  /**
   * Elements of {@link data} the pending upload covers, counted from index 0.
   * `-1` means all of it. Read by {@link uploadBufferRange} /
   * {@link uploadBufferStore}; runtimes never need it directly.
   */
  public get uploadElementCount(): number {
    return this._uploadElementCount;
  }

  /**
   * Bytes the pending upload covers - {@link data}'s `byteLength` for a whole
   * upload, the range's byte length for a partial one. This, not
   * `data.byteLength`, is what a runtime must compare its GPU store against and
   * what the accountant books.
   */
  public get uploadByteLength(): number {
    return this._uploadByteLength;
  }

  public get version(): number {
    return this._version;
  }

  public connect(runtime: WebGl2RenderBufferRuntime, accountant?: GpuResourceAccountant): this {
    this._runtime = runtime;
    this._accountant = accountant ?? null;

    if (this._uploadByteLength > 0) {
      runtime.upload(this, 0);
      this._bookUpload();
    }

    return this;
  }

  public disconnect(): this {
    this._runtime = null;

    return this;
  }

  /**
   * Stage `data` and issue the GPU upload at destination byte offset `offset`.
   *
   * `elementCount` uploads only the first `elementCount` ELEMENTS of `data`
   * (elements of the view's own type - floats for a `Float32Array`, not bytes),
   * which is what a renderer wants when it holds one grown-once scratch array
   * and fills a different prefix of it every flush. Passing the count is
   * equivalent to passing `data.subarray(0, elementCount)` in every observable
   * way - same GPU bytes, same accounted traffic, same store size - but does not
   * allocate a view per upload. Requires `data` to be an `ArrayBufferView`;
   * omit it (the default) to upload all of `data`.
   */
  public upload(data: DataContainer, offset = 0, elementCount = wholeBuffer): void {
    this._data = data;
    this._uploadElementCount = elementCount;
    this._uploadByteLength = elementCount === wholeBuffer ? data.byteLength : elementCount * bytesPerElementOf(data);
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

    const byteLength = this._uploadByteLength;

    accountant.recordBufferUpload(byteLength);

    if (byteLength > this._accountedBytes) {
      this._accountedBytes = accountant.reallocate(this._accountedBytes, byteLength);
    }
  }
}
