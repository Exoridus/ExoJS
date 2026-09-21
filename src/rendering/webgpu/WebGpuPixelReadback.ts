import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { PixelReadback } from '#rendering/PixelReadback';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

/** What a readback needs from the backend that owns it. @internal */
export interface WebGpuPixelReadbackHost {
  readonly accountant: GpuResourceAccountant;
  /** The live device, or `null` while there is none: before initialisation and while lost. */
  liveDevice(): GPUDevice | null;
  /** Submit the draws recorded so far and end the open pass, so the copy sees everything drawn into the source. */
  flushDraws(): void;
  /** The device texture backing `source`. */
  textureOf(source: RenderTexture): GPUTexture;
  /** Drop the readback from the backend's registry once it is destroyed. */
  forgetPixelReadback(readback: WebGpuPixelReadback): void;
}

const enum SlotState {
  Free,
  Pending,
  Ready,
  Failed,
}

interface Slot {
  buffer: GPUBuffer | null;
  state: SlotState;
  /** Bumped per request so a map that settles after its slot moved on is ignored. */
  generation: number;
  readonly data: Uint8ClampedArray;
}

/**
 * WebGPU readback: `copyTextureToBuffer` into a mappable staging buffer per
 * slot, then `mapAsync`. The frame-start drain reads `mapState` rather than
 * awaiting the promise, which keeps delivery synchronous and in request order.
 *
 * `copyTextureToBuffer` wants every row to start on a 256-byte boundary,
 * unlike `writeTexture`, so the staging rows are padded and unpacked into the
 * slot's array as they land.
 * @internal
 */
export class WebGpuPixelReadback implements PixelReadback {
  public readonly slots: number;

  private readonly _slots: Slot[] = [];
  /** Slot indices with a map outstanding, oldest first. */
  private readonly _queue: number[] = [];
  private readonly _bytesPerRow: number;
  private readonly _stride: number;
  private _destroyed = false;

  public constructor(
    private readonly _host: WebGpuPixelReadbackHost,
    private readonly _source: RenderTexture,
    private readonly _x: number,
    private readonly _y: number,
    private readonly _width: number,
    private readonly _height: number,
    slots: number,
  ) {
    this.slots = slots;
    this._stride = _width * 4;
    this._bytesPerRow = Math.ceil(this._stride / 256) * 256;

    for (let i = 0; i < slots; i++) {
      this._slots.push({ buffer: null, state: SlotState.Free, generation: 0, data: new Uint8ClampedArray(this._stride * _height) });
    }
  }

  public request(): number {
    const index = this._freeSlot();

    if (index === -1 || this._destroyed) {
      return -1;
    }

    const slot = this._slots[index]!;
    const device = this._host.liveDevice();

    if (device === null) {
      slot.state = SlotState.Failed;

      return index;
    }

    slot.buffer ??= device.createBuffer({
      label: 'backend:pixelReadback',
      size: this._bytesPerRow * this._height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this._host.flushDraws();

    const encoder = device.createCommandEncoder({ label: 'backend:pixelReadback:encoder' });

    encoder.copyTextureToBuffer(
      { texture: this._host.textureOf(this._source), origin: { x: this._x, y: this._y } },
      { buffer: slot.buffer, bytesPerRow: this._bytesPerRow, rowsPerImage: this._height },
      { width: this._width, height: this._height },
    );
    device.queue.submit([encoder.finish()]);

    const generation = ++slot.generation;

    slot.state = SlotState.Pending;
    this._queue.push(index);
    // A device lost mid-map rejects here. The drain never sees a mapped
    // state for it, so this is where the slot learns it failed.
    slot.buffer.mapAsync(GPUMapMode.READ).catch(() => {
      if (slot.generation === generation && slot.state === SlotState.Pending) {
        slot.state = SlotState.Failed;
      }
    });

    return index;
  }

  /** Frame-start drain: publish every slot whose map has settled, oldest first. */
  public poll(): void {
    while (this._queue.length > 0 && !this._destroyed) {
      const index = this._queue[0]!;
      const slot = this._slots[index]!;

      if (slot.state !== SlotState.Pending) {
        this._queue.shift();
        continue;
      }

      if (slot.buffer === null) {
        slot.state = SlotState.Failed;
        this._queue.shift();
        continue;
      }

      if (slot.buffer.mapState !== 'mapped') {
        return;
      }

      const padded = new Uint8Array(slot.buffer.getMappedRange());

      for (let row = 0; row < this._height; row++) {
        slot.data.set(padded.subarray(row * this._bytesPerRow, row * this._bytesPerRow + this._stride), row * this._stride);
      }

      slot.buffer.unmap();
      slot.state = SlotState.Ready;
      this._queue.shift();
      this._host.accountant.recordDownload(slot.data.byteLength);
    }
  }

  public isReady(slot: number): boolean {
    return this._slots[slot]!.state === SlotState.Ready;
  }

  public isFailed(slot: number): boolean {
    return this._slots[slot]!.state === SlotState.Failed;
  }

  public data(slot: number): Uint8ClampedArray {
    return this._slots[slot]!.data;
  }

  public release(index: number): void {
    const slot = this._slots[index]!;

    if (slot.state === SlotState.Pending) {
      // Unmapping a buffer with a map outstanding aborts that map, which is
      // what frees the slot for the next request without waiting.
      slot.buffer?.unmap();
      this._queue.splice(this._queue.indexOf(index), 1);
    }

    slot.generation++;
    slot.state = SlotState.Free;
  }

  /**
   * The device died: its buffers cannot be destroyed, only dropped. Pending
   * reads fail, finished ones keep their bytes, and buffers are recreated on
   * the next request against the replacement device.
   */
  public invalidateDeviceState(): void {
    for (const slot of this._slots) {
      slot.buffer = null;
      slot.generation++;
    }

    this._failPending();
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    for (const slot of this._slots) {
      slot.buffer?.destroy();
      slot.buffer = null;
      slot.generation++;
    }

    this._failPending();
    this._host.forgetPixelReadback(this);
  }

  private _freeSlot(): number {
    for (let i = 0; i < this._slots.length; i++) {
      if (this._slots[i]!.state === SlotState.Free) {
        return i;
      }
    }

    return -1;
  }

  private _failPending(): void {
    for (const index of this._queue) {
      this._slots[index]!.state = SlotState.Failed;
    }

    this._queue.length = 0;
  }
}
