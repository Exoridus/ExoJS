/// <reference types="@webgpu/types" />

import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';

/**
 * A frame-scoped, append-only GPU vertex buffer shared across the multiple batch
 * flushes an instanced renderer records into a single open render pass.
 *
 * WebGPU's `queue.writeBuffer` writes land on the queue timeline BEFORE the
 * submit that consumes them, so a renderer that keeps one reused instance buffer
 * and rewrites it at offset 0 on every flush would have every `drawIndexed` in a
 * merged submit read the LAST batch's bytes (aliasing). This arena hands each
 * batch a fresh byte offset within one buffer so all batches in a submit keep
 * their own data. The cursor resets whenever a new pass begins (tracked by the
 * identity of the coordinator's active pass), and capacity only grows.
 *
 * Growth reallocates the underlying buffer, which must not orphan draws already
 * recorded into the open pass — the caller is responsible for ending (submitting)
 * the pass before {@link grow} whenever {@link cursor} is non-zero.
 * @internal
 */
export class WebGpuInstanceArena {
  private readonly _label: string;
  private readonly _initialBytes: number;
  private _buffer: GPUBuffer | null = null;
  private _capacityBytes = 0;
  private _cursorBytes = 0;
  private _pass: WebGpuActiveRenderPass | null = null;

  public constructor(label: string, initialBytes: number) {
    this._label = label;
    this._initialBytes = initialBytes;
  }

  /** The backing GPU buffer, or `null` before the first {@link grow}. */
  public get buffer(): GPUBuffer | null {
    return this._buffer;
  }

  /** Bytes already handed out for batches recorded into the current open pass. */
  public get cursor(): number {
    return this._cursorBytes;
  }

  /** Whether `batchBytes` fits at the current cursor without a reallocation. */
  public fits(batchBytes: number): boolean {
    return this._buffer !== null && this._cursorBytes + batchBytes <= this._capacityBytes;
  }

  /**
   * Reset the write cursor when a different pass is open than the one the last
   * batch was appended into (the coordinator builds a fresh active-pass object
   * every time it opens a pass, so reference identity distinguishes passes).
   */
  public syncPass(pass: WebGpuActiveRenderPass): void {
    if (pass !== this._pass) {
      this._cursorBytes = 0;
      this._pass = pass;
    }
  }

  /** Drop the pass association so the next {@link syncPass} restarts the cursor. */
  public resetPass(): void {
    this._cursorBytes = 0;
    this._pass = null;
  }

  /**
   * Reallocate the buffer to hold at least `minBytes`, doubling from the current
   * capacity so it ratchets up to the whole frame's worth of instances. Only safe
   * when {@link cursor} is 0 (no in-flight pass references the old buffer).
   */
  public grow(device: GPUDevice, minBytes: number): void {
    const nextCapacity = Math.max(this._capacityBytes * 2, minBytes, this._initialBytes);

    this._buffer?.destroy();
    this._buffer = device.createBuffer({
      label: this._label,
      size: nextCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._capacityBytes = nextCapacity;
  }

  /** Reserve `batchBytes` at the cursor and advance it, returning the byte offset. */
  public take(batchBytes: number): number {
    const offset = this._cursorBytes;

    this._cursorBytes += batchBytes;

    return offset;
  }

  public destroy(): void {
    this._buffer?.destroy();
    this._buffer = null;
    this._capacityBytes = 0;
    this._cursorBytes = 0;
    this._pass = null;
  }
}
