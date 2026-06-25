/// <reference types="@webgpu/types" />

/**
 * Owning wrapper around a `GPUBuffer` allocated with `STORAGE | COPY_DST | COPY_SRC`.
 * Designed for the data-oriented ParticleSystem GPU path: one storage
 * buffer per SoA channel, written to from CPU each spawn frame, read by
 * compute shaders, and (optionally) read back to CPU for expire detection.
 *
 * Lifetime: the caller (typically `ParticleGpuState`) owns the buffer and
 * must call {@link destroy} when the system is torn down.
 */
export class WebGpuStorageBuffer {
  public readonly device: GPUDevice;
  public readonly buffer: GPUBuffer;
  public readonly byteLength: number;
  public readonly label: string;

  private _readbackBuffer: GPUBuffer | null = null;

  public constructor(device: GPUDevice, byteLength: number, label = 'storage') {
    this.device = device;
    this.byteLength = byteLength;
    this.label = label;
    this.buffer = device.createBuffer({
      label,
      size: byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  }

  /** Upload the contents of `data` to this buffer at `byteOffset`. */
  public write(data: ArrayBufferView, byteOffset = 0, byteSize?: number): void {
    this.device.queue.writeBuffer(this.buffer, byteOffset, data.buffer, data.byteOffset, byteSize ?? data.byteLength);
  }

  /**
   * Optional sink invoked after each {@link read} with the number of bytes read
   * back GPU → CPU. Lets a consumer route readback traffic into a backend's
   * resource accountant (`RenderStats.downloadBytes` / `downloadCount`) without
   * coupling this primitive to the backend. Defaults to a no-op.
   */
  public onReadback: ((bytes: number) => void) | null = null;

  /**
   * Copy this buffer's contents into a CPU-mappable readback buffer and
   * await the result. Allocates the readback buffer lazily on first call;
   * subsequent calls re-use it.
   *
   * Caller passes `target` (a typed-array view) to be filled. Async; one
   * frame of latency at minimum. Use sparingly — readback is a stall.
   */
  public async read(target: ArrayBufferView, encoder?: GPUCommandEncoder): Promise<void> {
    if (this._readbackBuffer === null) {
      this._readbackBuffer = this.device.createBuffer({
        label: `${this.label}-readback`,
        size: this.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }

    const ownEncoder = encoder ?? this.device.createCommandEncoder({ label: `${this.label}-readback-copy` });

    ownEncoder.copyBufferToBuffer(this.buffer, 0, this._readbackBuffer, 0, this.byteLength);

    if (encoder === undefined) {
      this.device.queue.submit([ownEncoder.finish()]);
    }

    await this._readbackBuffer.mapAsync(GPUMapMode.READ);

    const mapped = new Uint8Array(this._readbackBuffer.getMappedRange());
    const bytes = new Uint8Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength);

    bytes.set(mapped.subarray(0, target.byteLength));

    this._readbackBuffer.unmap();

    this.onReadback?.(target.byteLength);
  }

  public destroy(): void {
    this.buffer.destroy();

    if (this._readbackBuffer !== null) {
      this._readbackBuffer.destroy();
      this._readbackBuffer = null;
    }
  }
}
