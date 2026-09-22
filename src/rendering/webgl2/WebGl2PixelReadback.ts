import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { PixelReadback } from '#rendering/PixelReadback';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import { flipRowsInPlace } from './flipRowsInPlace';

/** What a readback needs from the backend that owns it. @internal */
export interface WebGl2PixelReadbackHost {
  readonly gl: WebGL2RenderingContext;
  readonly accountant: GpuResourceAccountant;
  isContextLost(): boolean;
  /** Submit the draws recorded so far, so the copy sees everything drawn into the source. */
  flushDraws(): void;
  /** Run `body` with `source` attached as the read framebuffer, restoring the previous binding afterwards. */
  withReadFramebuffer(source: RenderTexture, body: () => void): void;
  /** Drop the readback from the backend's registry once it is destroyed. */
  forgetPixelReadback(readback: WebGl2PixelReadback): void;
}

const enum SlotState {
  Free,
  Pending,
  Ready,
  Failed,
}

interface Slot {
  buffer: WebGLBuffer | null;
  sync: WebGLSync | null;
  /** Whether `clientWaitSync` has run on `sync` yet; the first poll must flush (see `poll`). */
  polled: boolean;
  state: SlotState;
  readonly data: Uint8ClampedArray;
}

/**
 * Non-blocking WebGL2 readback: `readPixels` into a pixel pack buffer, which
 * returns without waiting because the destination is GPU memory, then a fence
 * whose completion the frame-start drain polls. Only once the fence signals
 * does `getBufferSubData` run, at which point it is a memcpy.
 *
 * Slots are delivered in request order. GL executes in order anyway, so
 * stopping the drain at the first unsignalled fence loses nothing.
 * @internal
 */
export class WebGl2PixelReadback implements PixelReadback {
  public readonly slots: number;

  private readonly _slots: Slot[] = [];
  /** Slot indices with a fence outstanding, oldest first. */
  private readonly _queue: number[] = [];
  private readonly _scratchRow: Uint8ClampedArray;
  private readonly _bytes: number;
  private _destroyed = false;

  public constructor(
    private readonly _host: WebGl2PixelReadbackHost,
    private readonly _source: RenderTexture,
    private readonly _x: number,
    private readonly _y: number,
    private readonly _width: number,
    private readonly _height: number,
    slots: number,
  ) {
    this.slots = slots;
    this._bytes = _width * _height * 4;
    this._scratchRow = new Uint8ClampedArray(_width * 4);

    for (let i = 0; i < slots; i++) {
      this._slots.push({ buffer: null, sync: null, polled: false, state: SlotState.Free, data: new Uint8ClampedArray(this._bytes) });
    }
  }

  public request(): number {
    const index = this._freeSlot();

    if (index === -1 || this._destroyed) {
      return -1;
    }

    const slot = this._slots[index]!;

    if (this._host.isContextLost()) {
      slot.state = SlotState.Failed;

      return index;
    }

    const gl = this._host.gl;

    if (slot.buffer === null) {
      slot.buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this._bytes, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }

    this._host.flushDraws();
    this._host.withReadFramebuffer(this._source, () => {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
      // GL addresses pixels from the bottom-left, so the requested top-down
      // rectangle starts this far up; the rows are flipped once they land.
      gl.readPixels(this._x, this._source.height - (this._y + this._height), this._width, this._height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    });

    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    slot.polled = false;
    slot.state = SlotState.Pending;
    this._queue.push(index);

    return index;
  }

  /** Frame-start drain: publish every slot whose fence has signalled, oldest first. */
  public poll(): void {
    if (this._queue.length === 0 || this._destroyed) {
      return;
    }

    if (this._host.isContextLost()) {
      this._failPending();

      return;
    }

    const gl = this._host.gl;

    while (this._queue.length > 0) {
      const slot = this._slots[this._queue[0]!]!;

      if (slot.sync === null) {
        this._queue.shift();
        continue;
      }

      // Nothing guarantees the command stream holding the fence was ever
      // submitted, so the first poll flushes it. Without that a fence can sit
      // unsignalled forever and this polls until the reader is destroyed.
      const status = gl.clientWaitSync(slot.sync, slot.polled ? 0 : gl.SYNC_FLUSH_COMMANDS_BIT, 0);

      slot.polled = true;

      if (status === gl.TIMEOUT_EXPIRED) {
        return;
      }

      gl.deleteSync(slot.sync);
      slot.sync = null;
      this._queue.shift();

      if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
        slot.state = SlotState.Failed;
        continue;
      }

      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, slot.data);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      flipRowsInPlace(slot.data, this._width, this._height, this._scratchRow);
      slot.state = SlotState.Ready;
      this._host.accountant.recordDownload(this._bytes);
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

    if (slot.sync !== null) {
      if (!this._host.isContextLost()) {
        this._host.gl.deleteSync(slot.sync);
      }

      slot.sync = null;
      this._queue.splice(this._queue.indexOf(index), 1);
    }

    slot.state = SlotState.Free;
  }

  /**
   * The context died: every buffer and fence went with it. Pending reads fail,
   * finished ones keep their bytes, and buffers are recreated on the next
   * request against the restored context.
   */
  public invalidateDeviceResources(): void {
    for (const slot of this._slots) {
      slot.buffer = null;
      slot.sync = null;
    }

    this._failPending();
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;

    if (!this._host.isContextLost()) {
      const gl = this._host.gl;

      for (const slot of this._slots) {
        if (slot.sync !== null) {
          gl.deleteSync(slot.sync);
        }

        if (slot.buffer !== null) {
          gl.deleteBuffer(slot.buffer);
        }
      }
    }

    for (const slot of this._slots) {
      slot.buffer = null;
      slot.sync = null;
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
      const slot = this._slots[index]!;

      slot.sync = null;
      slot.state = SlotState.Failed;
    }

    this._queue.length = 0;
  }
}
