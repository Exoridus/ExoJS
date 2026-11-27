/// <reference types="@webgpu/types" />

/**
 * Owning wrapper around a `GPUBuffer` allocated with `STORAGE | COPY_DST | COPY_SRC`,
 * plus any `extraUsage` flags passed at construction (e.g. `GPUBufferUsage.VERTEX`
 * for a buffer a compute shader writes and a render pass then reads as instanced
 * vertex input). Designed for the data-oriented ParticleSystem GPU path: one
 * storage buffer per SoA channel, written to from CPU each spawn frame, read by
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

  private readonly _readbackSlots: Array<{ buffer: GPUBuffer; busy: boolean }> = [];
  private _destroyed = false;

  public constructor(device: GPUDevice, byteLength: number, label = 'storage', extraUsage: GPUBufferUsageFlags = 0) {
    this.device = device;
    this.byteLength = byteLength;
    this.label = label;
    this.buffer = device.createBuffer({
      label,
      size: byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extraUsage,
    });
  }

  /** Upload the contents of `data` to this buffer at `byteOffset`. */
  public write(data: ArrayBufferView, byteOffset = 0, byteSize?: number): void {
    this.device.queue.writeBuffer(this.buffer, byteOffset, data.buffer, data.byteOffset, byteSize ?? data.byteLength);
  }

  /**
   * Optional sink invoked after each completed readback with the number of bytes read
   * back GPU → CPU. Lets a consumer route readback traffic into a backend's
   * resource accountant (`RenderStats.downloadBytes` / `downloadCount`) without
   * coupling this primitive to the backend. Defaults to a no-op.
   */
  public onReadback: ((bytes: number) => void) | null = null;

  /**
   * Submit a copy of the requested source range and fill `target` when it maps.
   * Each in-flight read owns a staging slot, so overlapping reads observe their
   * own submitted copies. At most three slots are allocated lazily and reused.
   *
   * `sourceByteOffset` and `target.byteLength` must be multiples of four and the
   * range must fit this buffer. An empty target completes without GPU work.
   * Rejects after destruction or while all three staging slots are occupied.
   */
  public async read(target: ArrayBufferView, sourceByteOffset = 0): Promise<void> {
    this._validateRead(target, sourceByteOffset);

    if (target.byteLength === 0) {
      return;
    }

    const encoder = this.device.createCommandEncoder({ label: `${this.label}-readback-copy` });
    const slot = this._recordCopy(encoder, target.byteLength, sourceByteOffset);

    try {
      this.device.queue.submit([encoder.finish()]);
    } catch (error) {
      slot.busy = false;

      throw error;
    }

    await this._completeRead(slot, target, target.byteLength);
  }

  /**
   * Record a source-range copy in a caller-owned encoder without submitting or
   * mapping it. Call the returned completion function only after submitting
   * that encoder. Repeated calls share one completion promise.
   *
   * The same range and three-slot capacity limits as {@link read} apply. A
   * recorded copy reserves its slot until completion or {@link destroy}, even
   * if its encoder is abandoned. Keep `target` attached and its range valid until completion.
   */
  public recordRead(encoder: GPUCommandEncoder, target: ArrayBufferView, sourceByteOffset = 0): () => Promise<void> {
    this._validateRead(target, sourceByteOffset);

    if (target.byteLength === 0) {
      const completed = Promise.resolve();

      return () => completed;
    }

    const byteLength = target.byteLength;
    const slot = this._recordCopy(encoder, byteLength, sourceByteOffset);
    let completion: Promise<void> | null = null;

    return () => (completion ??= this._completeRead(slot, target, byteLength));
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this.buffer.destroy();

    for (const slot of this._readbackSlots) {
      slot.buffer.destroy();
    }

    this._readbackSlots.length = 0;
  }

  private _validateRead(target: ArrayBufferView, sourceByteOffset: number): void {
    if (this._destroyed) {
      throw new Error('Cannot read a destroyed storage buffer.');
    }

    if (!ArrayBuffer.isView(target)) {
      throw new TypeError('Readback target must be an ArrayBuffer view.');
    }

    if (
      !Number.isSafeInteger(sourceByteOffset) ||
      sourceByteOffset < 0 ||
      sourceByteOffset % 4 !== 0 ||
      target.byteLength % 4 !== 0 ||
      sourceByteOffset + target.byteLength > this.byteLength
    ) {
      throw new RangeError('Readback range must be four-byte aligned and fit the storage buffer.');
    }
  }

  private _recordCopy(encoder: GPUCommandEncoder, byteLength: number, sourceByteOffset: number): { buffer: GPUBuffer; busy: boolean } {
    let slot = this._readbackSlots.find(candidate => !candidate.busy);

    if (slot === undefined) {
      if (this._readbackSlots.length === 3) {
        throw new Error('Storage buffer readback capacity exhausted.');
      }

      slot = {
        buffer: this.device.createBuffer({
          label: `${this.label}-readback`,
          size: this.byteLength,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
        busy: false,
      };
      this._readbackSlots.push(slot);
    }

    slot.busy = true;

    try {
      encoder.copyBufferToBuffer(this.buffer, sourceByteOffset, slot.buffer, 0, byteLength);
    } catch (error) {
      slot.busy = false;

      throw error;
    }

    return slot;
  }

  private async _completeRead(slot: { buffer: GPUBuffer; busy: boolean }, target: ArrayBufferView, byteLength: number): Promise<void> {
    if (this._destroyed) {
      throw new Error('Cannot complete a read from a destroyed storage buffer.');
    }

    let mapped = false;

    try {
      await slot.buffer.mapAsync(GPUMapMode.READ, 0, byteLength);
      mapped = true;

      if (this._destroyed) {
        throw new Error('Cannot complete a read from a destroyed storage buffer.');
      }

      if (target.byteLength < byteLength) {
        throw new TypeError('Readback target was detached or resized before completion.');
      }

      const bytes = new Uint8Array(target.buffer, target.byteOffset, byteLength);

      bytes.set(new Uint8Array(slot.buffer.getMappedRange(0, byteLength)));
    } finally {
      if (mapped) {
        slot.buffer.unmap();
      }

      slot.busy = false;
    }

    this.onReadback?.(byteLength);
  }
}
