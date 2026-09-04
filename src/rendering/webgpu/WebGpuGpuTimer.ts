import type { GpuTimer } from '#rendering/GpuTimer';

/**
 * Timestamp slots one frame may consume. A render pass costs two, so this
 * covers 512 passes - an order of magnitude above what an effect-heavy frame
 * opens. A frame that still exhausts it publishes no sample rather than a
 * silently truncated one.
 */
const queryCapacity = 1024;

const bytesPerQuery = 8;

/**
 * Readback buffers kept in rotation. A frame's results are read back while
 * later frames are already recording, so a single buffer would leave every
 * other frame unmeasured while its predecessor's mapping was still open.
 */
const readbackBufferCount = 3;

/**
 * The half of {@link WebGpuGpuTimer} the pass coordinator drives: one call per
 * render pass it opens, whose result goes straight into the pass descriptor.
 * @internal
 */
export interface WebGpuTimestampSink {
  /**
   * Timestamp writes bracketing the pass about to be opened, or `undefined`
   * when this pass is not being timed (outside a timed frame, or once the
   * frame's slots are used up).
   */
  acquirePassWrites(): GPURenderPassTimestampWrites | undefined;
}

/**
 * GPU frame timer backed by WebGPU's `timestamp-query` feature.
 *
 * Every render pass the frame opens is bracketed by a timestamp pair, and the
 * frame's GPU time is the sum of those intervals. Two consequences are worth
 * knowing before reading the number:
 *
 * - It measures render-pass EXECUTION. `queue.writeBuffer` and `writeTexture`
 *   are queue operations that sit outside every pass, so an upload-heavy frame
 *   spends GPU time this value does not see. Mipmap generation, which runs on
 *   its own encoder at texture-upload time, is likewise not counted.
 * - Results are read back asynchronously, so the published value trails the
 *   frame on screen by at least one frame.
 *
 * The wall-clock alternative (`queue.onSubmittedWorkDone`) is deliberately not
 * used as a fallback: its floor is when the browser observes completion, which
 * is milliseconds even for microseconds of GPU work.
 * @internal
 */
export class WebGpuGpuTimer implements GpuTimer, WebGpuTimestampSink {
  private readonly _device: GPUDevice;
  private readonly _querySet: GPUQuerySet;
  private readonly _resolveBuffer: GPUBuffer;
  private readonly _readbackBuffers: GPUBuffer[] = [];
  /** Buffers not currently holding an unfinished mapping, and therefore reusable. */
  private readonly _freeBuffers: GPUBuffer[] = [];

  private _lastFrameMs: number | null = null;
  private _nextQuery = 0;
  private _timing = false;
  private _exhausted = false;
  private _destroyed = false;

  /**
   * Returns `null` when the device carries no `timestamp-query` feature - the
   * feature set is fixed at device creation, so this cannot be recovered from
   * here and the backend simply has no hardware GPU clock.
   */
  public static create(device: GPUDevice): WebGpuGpuTimer | null {
    // Optional chaining covers a stand-in device object (a test double, a probe
    // harness) that is not a real GPUDevice; on one, `features` is mandatory.
    if (!device.features?.has('timestamp-query')) {
      return null;
    }

    return new WebGpuGpuTimer(device);
  }

  private constructor(device: GPUDevice) {
    this._device = device;
    this._querySet = device.createQuerySet({ type: 'timestamp', count: queryCapacity, label: 'gpu-timer:query-set' });
    this._resolveBuffer = device.createBuffer({
      size: queryCapacity * bytesPerQuery,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      label: 'gpu-timer:resolve',
    });

    for (let index = 0; index < readbackBufferCount; index++) {
      const buffer = device.createBuffer({
        size: queryCapacity * bytesPerQuery,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        label: `gpu-timer:readback-${index}`,
      });

      this._readbackBuffers.push(buffer);
      this._freeBuffers.push(buffer);
    }
  }

  public get lastFrameMs(): number | null {
    return this._lastFrameMs;
  }

  public beginFrame(): void {
    if (this._destroyed) {
      return;
    }

    this._nextQuery = 0;
    this._exhausted = false;
    this._timing = true;
  }

  public acquirePassWrites(): GPURenderPassTimestampWrites | undefined {
    if (!this._timing || this._nextQuery + 2 > queryCapacity) {
      // Only a pass inside a timed frame can exhaust the set; a pass opened
      // outside one is untimed by design and is not a truncation.
      if (this._timing) {
        this._exhausted = true;
      }

      return undefined;
    }

    const beginningOfPassWriteIndex = this._nextQuery;

    this._nextQuery += 2;

    return { querySet: this._querySet, beginningOfPassWriteIndex, endOfPassWriteIndex: beginningOfPassWriteIndex + 1 };
  }

  public endFrame(): void {
    if (!this._timing) {
      return;
    }

    this._timing = false;

    const resolved = this._nextQuery;
    const readback = this._freeBuffers.pop();

    // A truncated frame would under-report by however many passes went
    // unbracketed, and a frame with no free readback buffer has nowhere to
    // resolve into. Both drop the sample instead of publishing a wrong one.
    if (resolved === 0 || this._exhausted || readback === undefined) {
      if (readback !== undefined) {
        this._freeBuffers.push(readback);
      }

      return;
    }

    const byteLength = resolved * bytesPerQuery;

    try {
      const encoder = this._device.createCommandEncoder({ label: 'gpu-timer:resolve-encoder' });

      encoder.resolveQuerySet(this._querySet, 0, resolved, this._resolveBuffer, 0);
      encoder.copyBufferToBuffer(this._resolveBuffer, 0, readback, 0, byteLength);
      this._device.queue.submit([encoder.finish()]);

      void this._readBack(readback, resolved);
    } catch {
      this._freeBuffers.push(readback);
    }
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._timing = false;
    this._lastFrameMs = null;
    this._querySet.destroy();
    this._resolveBuffer.destroy();

    // Buffers with a mapping still in flight are destroyed here as well: the
    // pending `mapAsync` then rejects, which `_readBack` swallows.
    for (const buffer of this._readbackBuffers) {
      buffer.destroy();
    }

    this._readbackBuffers.length = 0;
    this._freeBuffers.length = 0;
  }

  private async _readBack(buffer: GPUBuffer, resolved: number): Promise<void> {
    const byteLength = resolved * bytesPerQuery;

    try {
      await buffer.mapAsync(GPUMapMode.READ, 0, byteLength);
    } catch {
      // A rejected mapping means the device went away or the timer was
      // destroyed underneath it; the buffer must not go back into rotation.
      return;
    }

    if (this._destroyed) {
      return;
    }

    try {
      const timestamps = new BigUint64Array(buffer.getMappedRange(0, byteLength));

      let totalMs = 0;
      let measured = false;

      for (let index = 0; index + 1 < resolved; index += 2) {
        const begin = timestamps[index]!;
        const end = timestamps[index + 1]!;

        // An unavailable query resolves to zero and an interrupted GPU clock
        // yields a non-increasing pair. Neither is a measurement of anything.
        if (begin === 0n || end <= begin) {
          continue;
        }

        totalMs += Number(end - begin) / 1e6;
        measured = true;
      }

      if (measured) {
        this._lastFrameMs = totalMs;
      }
    } finally {
      try {
        buffer.unmap();
      } catch {
        // Already unmapped, or the device went away while the range was open.
      }

      this._freeBuffers.push(buffer);
    }
  }
}
