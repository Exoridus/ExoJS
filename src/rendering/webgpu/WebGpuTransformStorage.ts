import type { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Drawable } from '#rendering/Drawable';
import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { DrawCommand } from '#rendering/plan/RenderCommand';
import { TransformBuffer } from '#rendering/TransformBuffer';

const slotFloatCount = 12;

/** @internal */
export class WebGpuTransformStorage {
  private readonly _buffer = new TransformBuffer();
  private _storageBuffer: GPUBuffer | null = null;
  private _storageCapacity = 0;
  private _storageHash = 0;
  private _storageCount = -1;
  private _needsFullUpload = false;
  private _accountant: GpuResourceAccountant | null = null;
  /** GPU bytes currently booked for the storage buffer with the resource accountant. */
  private _accountedBytes = 0;

  /**
   * Underlying shared transform buffer. Exposed for internal stats / tests
   * (write, skip and upload counters); not part of any public surface.
   * @internal
   */
  public get buffer(): TransformBuffer {
    return this._buffer;
  }

  /** Reset the underlying frame-scoped buffer. Used directly by tests. @internal */
  public begin(nodeCount = 0): void {
    this._buffer.begin(nodeCount);
  }

  public writeCommand(command: DrawCommand, transform?: Matrix): void {
    const drawable = command.drawable;

    this._buffer.write(command.nodeIndex, transform ?? drawable.getGlobalTransform(), drawable.tint);
  }

  /**
   * Record that a draw command's transform write was skipped because its
   * renderer opts out of the shared transform storage. Stats only.
   * @internal
   */
  public recordSkippedWrite(): void {
    this._buffer.recordSkippedWrite();
  }

  /**
   * Append a drawable's world transform (+ tint) to the shared buffer and return
   * the slot it was written to. Used for draws that arrive without a stable
   * `nodeIndex` — a direct `backend.draw(drawable)` outside the plan player —
   * so a batch of synthetic draws does not collide on a single row.
   */
  public push(drawable: Drawable, transform?: Matrix): number {
    return this._buffer.push(transform ?? drawable.getGlobalTransform(), drawable.tint);
  }

  /**
   * Append a raw `(transform, tint)` pair to the shared buffer and return its
   * slot. Unlike {@link push} the values are supplied directly rather than read
   * from a drawable — used by explicit instanced batches.
   */
  public pushValues(transform: Matrix, tint: Color): number {
    return this._buffer.push(transform, tint);
  }

  /**
   * Pre-allocate (or grow) the GPU storage buffer to hold at least
   * `recordCount` transform slots. Called once before render-plan playback so
   * that later per-group flushes never trigger a mid-frame reallocation.
   *
   * If the buffer already covers `recordCount` this is a no-op — no GPU
   * objects are destroyed or re-created. Capacity only grows, never shrinks.
   * @internal
   */
  public reserve(device: GPUDevice, recordCount: number, accountant?: GpuResourceAccountant): void {
    this._accountant = accountant ?? this._accountant;

    const minCount = Math.max(1, recordCount);
    const requiredBytes = minCount * slotFloatCount * Float32Array.BYTES_PER_ELEMENT;

    if (this._storageBuffer !== null && requiredBytes <= this._storageCapacity) {
      return;
    }

    this._growBuffer(device, requiredBytes);
  }

  public getBuffer(device: GPUDevice, minCount: number, accountant?: GpuResourceAccountant): { readonly buffer: GPUBuffer; readonly count: number } {
    this._accountant = accountant ?? this._accountant;

    const requiredCount = Math.max(1, minCount);
    const requiredBytes = requiredCount * slotFloatCount * Float32Array.BYTES_PER_ELEMENT;
    const snapshot = this._buffer.commitSnapshot(requiredCount);

    if (this._storageBuffer === null || requiredBytes > this._storageCapacity) {
      this._growBuffer(device, requiredBytes);
    }

    if (snapshot.changed || snapshot.hash !== this._storageHash || snapshot.count !== this._storageCount) {
      // Always consume the dirty range first to clear it, regardless of which upload
      // path runs — a stale dirty range must never leak into the next flush.
      const { firstRow, rowCount } = this._buffer.consumeDirtyRange(snapshot.count);

      const slotBytes = slotFloatCount * Float32Array.BYTES_PER_ELEMENT;

      if (this._needsFullUpload) {
        // Post-grow: the new GPUBuffer is empty; upload the full [0, snapshot.count)
        // range so rows already consumed by earlier flushes this frame are present.
        device.queue.writeBuffer(this._storageBuffer!, 0, this._buffer.data.buffer, this._buffer.data.byteOffset, snapshot.count * slotBytes);
        this._buffer.recordUpload(snapshot.count);
        this._accountant?.recordBufferUpload(snapshot.count * slotBytes);
        this._needsFullUpload = false;
      } else if (rowCount > 0) {
        // Normal delta path: upload only the rows written since the last upload.
        // A reused slot below the high-water mark is in the dirty range, so it re-uploads.
        device.queue.writeBuffer(
          this._storageBuffer!,
          firstRow * slotBytes,
          this._buffer.data.buffer,
          this._buffer.data.byteOffset + firstRow * slotBytes,
          rowCount * slotBytes,
        );
        this._buffer.recordUpload(rowCount);
        this._accountant?.recordBufferUpload(rowCount * slotBytes);
      }

      this._storageHash = snapshot.hash;
      this._storageCount = snapshot.count;
    }

    return {
      buffer: this._storageBuffer!,
      count: snapshot.count,
    };
  }

  public destroy(): void {
    this._storageBuffer?.destroy();
    this._storageBuffer = null;
    this._storageCapacity = 0;
    this._storageHash = 0;
    this._storageCount = -1;

    if (this._accountedBytes > 0) {
      this._accountant?.free(this._accountedBytes);
      this._accountedBytes = 0;
    }
  }

  private _growBuffer(device: GPUDevice, requiredBytes: number): void {
    let nextCapacity = Math.max(this._storageCapacity, slotFloatCount * Float32Array.BYTES_PER_ELEMENT);

    while (nextCapacity < requiredBytes) {
      nextCapacity *= 2;
    }

    this._storageBuffer?.destroy();
    this._storageBuffer = device.createBuffer({
      size: nextCapacity,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._storageCapacity = nextCapacity;
    this._storageHash = 0;
    this._storageCount = -1;
    this._needsFullUpload = true;
    // Re-book the storage footprint (free the prior buffer's bytes, allocate the new).
    this._accountedBytes = this._accountant?.reallocate(this._accountedBytes, nextCapacity) ?? this._accountedBytes;
  }
}
