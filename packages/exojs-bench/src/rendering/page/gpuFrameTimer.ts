/**
 * Per-frame GPU-time sources shared by every page this package serves: the
 * Playwright-driven matrix harness (`page/harness.ts`) and the manual DPR probe
 * (`dpr-probe/page/probe.ts`). Extracted verbatim from the matrix harness so the
 * two pages cannot drift apart on what "GPU time" means or on which samples are
 * dropped as unmeasurable.
 */

/** Note recorded on a cell whose full-frame time came from rAF cadence, not a GPU timer. */
export const NO_GPU_TIMER_NOTE = 'frame time from rAF delta; no GPU timer';

/**
 * Note recorded on a WebGPU cell whose frame time comes from hardware
 * `timestamp-query` writes around the frame's render passes.
 *
 * The exclusion is the load-bearing half: `queue.writeBuffer` is a QUEUE
 * operation, not a command-buffer command, so its device copy never sits inside
 * a render pass and no timestamp pair can bracket it. On an upload-heavy frame
 * that copy is the dominant GPU cost (measured: a 34.5MiB upload frame whose
 * render pass took 0.41ms occupied the queue for 26.7ms). `queueMs*` is the
 * column that sees it.
 */
export const WEBGPU_TIMESTAMP_NOTE =
  "frame time from hardware timestamp-query around the frame's render passes (render-pass execution only — queue.writeBuffer upload copies are queue operations outside any pass and are NOT included; see queueMs* for a measure that does see them). Not comparable to the WebGL2 hardware query, which brackets the frame's whole GL command stream including uploads";

/**
 * Note recorded on a WebGPU cell that could not obtain `timestamp-query`, so it
 * has no hardware GPU clock at all. The queue-completion wall clock is
 * deliberately NOT promoted into the gap: it is floored by completion-observation
 * latency (measured at 0.5ms when the frame presents, 3.2ms when it does not,
 * against 0.002ms of actual GPU work), so it cannot stand in for frame time.
 */
export const WEBGPU_NO_TIMESTAMP_NOTE =
  'WebGPU device exposes no timestamp-query feature, so this backend has no hardware GPU clock here; frame time falls back to the rAF present cadence and queueMs* is reported separately';

/**
 * Note recorded alongside every WebGPU cell's `queueMs*` pair, stating exactly
 * what that column is and - just as importantly - what its floor is.
 */
export const WEBGPU_QUEUE_NOTE =
  "queueMs* = queue occupancy attributed to the frame that caused it (doneAt − max(submitAt, previous doneAt)), from queue.onSubmittedWorkDone. It is an UPPER BOUND on the frame's queue work and carries a completion-observation floor of ~0.5ms (presenting frame) to ~3.2ms (non-presenting), so any value below ~4ms is dominated by observation latency rather than GPU work; read it for large events, never as a small-frame GPU time";

/** Both series a GPU timer can produce for one cell. */
export interface GpuFrameSamples {
  /** Per-frame GPU time (ms) from a hardware clock. Empty when none was wired. */
  readonly frameMs: readonly number[];
  /** WebGPU only: per-frame queue-occupancy upper bound (ms). Empty on every other backend. */
  readonly queueMs: readonly number[];
}

/**
 * Per-frame GPU-time source. `available` is false for the inert fallback used
 * when no hardware GPU clock exists; callers then fall back to the rAF-delta
 * wall clock.
 */
export interface GpuFrameTimer {
  /** Whether a real hardware GPU clock is wired (vs. the inert fallback). */
  readonly available: boolean;
  /** Caveat to attach to the cell when THIS timer's samples are the reported frame time, or null when the source needs none. */
  readonly note: string | null;
  /**
   * Wait until GPU work submitted BEFORE the timed window has completed, so no
   * warmup work can be charged to a timed frame. Called exactly once, at the
   * warmup/timing boundary; a no-op for timers that cannot inherit a backlog.
   */
  drainSubmittedWork(): Promise<void>;
  /** Open a GPU-time query bracketing the current frame's GPU commands. */
  beginFrame(): void;
  /** Close the current frame's GPU-time query. */
  endFrame(): void;
  /** Drain/await pending samples and return every series this timer gathered. */
  collect(): Promise<GpuFrameSamples>;
}

/** GPU timer used when no timer extension/feature is available: contributes nothing, never fabricates a number. */
export const noopGpuTimer: GpuFrameTimer = {
  available: false,
  note: null,
  async drainSubmittedWork(): Promise<void> {
    /* nothing submitted through a timer here; the rAF-delta fallback measures presentation cadence, which carries no queue backlog */
  },
  beginFrame(): void {
    /* no GPU timer wired */
  },
  endFrame(): void {
    /* no GPU timer wired */
  },
  async collect(): Promise<GpuFrameSamples> {
    return { frameMs: [], queueMs: [] };
  },
};

/** Minimal surface of `EXT_disjoint_timer_query_webgl2` this harness consumes. */
interface DisjointTimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * A real GPU-time source backed by `EXT_disjoint_timer_query_webgl2` when the
 * context exposes it (browsers gate it behind privacy policy, so it is usually
 * absent - then this returns {@link noopGpuTimer} and the caller uses the rAF
 * delta). One `TIME_ELAPSED` query may be outstanding at a time, so each frame
 * opens a query, closes it, and drains any results that have since resolved;
 * unresolved queries are collected at the end. Every GL call is guarded: any
 * failure disables the timer for the rest of the cell rather than throwing mid
 * frame, so a flaky extension never corrupts the primary CPU metric.
 */
export const createWebGl2GpuTimer = (gl: WebGL2RenderingContext): GpuFrameTimer => {
  let extension: DisjointTimerExtension | null;

  try {
    extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerExtension | null;
  } catch {
    extension = null;
  }

  if (extension === null) {
    return noopGpuTimer;
  }

  const timeElapsedTarget = extension.TIME_ELAPSED_EXT;
  const disjointParam = extension.GPU_DISJOINT_EXT;
  const pending: WebGLQuery[] = [];
  const samplesMs: number[] = [];
  let active: WebGLQuery | null = null;
  let failed = false;

  const drain = (): void => {
    while (pending.length > 0) {
      const query = pending[0]!;
      const ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true;

      if (!ready) {
        return;
      }

      const disjoint = gl.getParameter(disjointParam) === true;

      pending.shift();

      // A disjoint interval means the GPU clock was interrupted (throttle, ctx
      // switch); the result is meaningless, so drop it rather than record noise.
      if (!disjoint) {
        const elapsedNs = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;

        samplesMs.push(elapsedNs / 1e6);
      }

      gl.deleteQuery(query);
    }
  };

  return {
    available: true,
    // A real hardware GPU-time query: canonical GPU frame time, no caveat needed.
    note: null,
    async drainSubmittedWork(): Promise<void> {
      // A TIME_ELAPSED query measures only the commands between its own
      // begin/end, so a timed frame's sample structurally cannot absorb work
      // submitted during warmup. Nothing to wait for.
    },
    beginFrame(): void {
      if (failed) {
        return;
      }

      try {
        const query = gl.createQuery();

        if (query === null) {
          return;
        }

        active = query;
        gl.beginQuery(timeElapsedTarget, query);
      } catch {
        failed = true;
        active = null;
      }
    },
    endFrame(): void {
      if (failed || active === null) {
        return;
      }

      try {
        gl.endQuery(timeElapsedTarget);
        pending.push(active);
        active = null;
        drain();
      } catch {
        failed = true;
      }
    },
    async collect(): Promise<GpuFrameSamples> {
      // Results are near-certainly resolved once every timed frame has run;
      // spin-drain with a hard cap so a stuck query can never hang the harness.
      for (let spins = 0; pending.length > 0 && spins < 10_000; spins++) {
        drain();
      }

      return { frameMs: samplesMs, queueMs: [] };
    },
  };
};

/**
 * Timestamp query slots one cell may consume. A render pass costs two, so this
 * covers 2048 passes across a timed window (120 frames × 17 passes). A cell that
 * exhausts it stops timestamping and says so in its note rather than reporting a
 * silently truncated series.
 */
const TIMESTAMP_QUERY_CAPACITY = 4096;

/**
 * Make every `requestDevice` on this page also ask for `timestamp-query` when
 * the adapter has it.
 *
 * A device's feature set is immutable, and every arm - ours and the competitors'
 * - builds its own device descriptor, so the feature cannot be added after the
 * fact. Patching the adapter prototype at module scope is the only place that
 * runs before any arm's `init`. The patch is ADDITIVE (an arm's own
 * `requiredFeatures` are preserved) and IDENTICAL for every arm, so it cannot
 * tilt a comparison; requesting an unused feature does not change rendering
 * behaviour.
 */
export const requestTimestampFeature = (): void => {
  const adapterClass = (globalThis as unknown as { GPUAdapter?: { prototype: Record<string, unknown> } }).GPUAdapter;
  const original = adapterClass?.prototype['requestDevice'];

  if (typeof original !== 'function') {
    return;
  }

  adapterClass!.prototype['requestDevice'] = function requestDevice(this: GPUAdapter, descriptor?: GPUDeviceDescriptor): unknown {
    const features = new Set<GPUFeatureName>(descriptor?.requiredFeatures ?? []);

    if (this.features.has('timestamp-query')) {
      features.add('timestamp-query');
    }

    return (original as (this: GPUAdapter, d: GPUDeviceDescriptor) => unknown).call(this, { ...descriptor, requiredFeatures: [...features] });
  };
};

/** A frame's hardware timestamp pairs, in the order the passes were encoded. */
interface TimestampPass {
  readonly frame: number;
  readonly begin: number;
  readonly end: number;
}

/**
 * Hardware GPU clock for WebGPU, from `timestamp-query` writes around every
 * render pass of a frame.
 *
 * The engine's pass descriptors are reachable: `beginRenderPass` reads its
 * descriptor synchronously, so wrapping the device's `createCommandEncoder` and
 * the encoders it returns is enough to inject `timestampWrites` without touching
 * engine source. Query slots are allocated per pass and resolved ONCE, after the
 * timed window - no per-frame readback, so the instrument adds no completion
 * wait to the measured path.
 *
 * Returns null when the device has no `timestamp-query` feature; the caller then
 * has no hardware GPU clock for this cell and says so.
 */
const createTimestampSource = (
  device: GPUDevice,
): {
  beginFrame(frame: number): void;
  endWindow(): void;
  collect(): Promise<{ frameMs: number[]; note: string | null }>;
} | null => {
  // `features` is mandatory on a real `GPUDevice`; the optional chain covers the
  // degrade path where an arm hands back an object that is not one.
  if (device.features?.has('timestamp-query') !== true) {
    return null;
  }

  const querySet = device.createQuerySet({ type: 'timestamp', count: TIMESTAMP_QUERY_CAPACITY, label: 'bench:frame-timestamps' });
  const resolveBuffer = device.createBuffer({
    size: TIMESTAMP_QUERY_CAPACITY * 8,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    label: 'bench:timestamp-resolve',
  });
  const readBuffer = device.createBuffer({
    size: TIMESTAMP_QUERY_CAPACITY * 8,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    label: 'bench:timestamp-readback',
  });

  const passes: TimestampPass[] = [];
  let currentFrame = -1;
  let nextQuery = 0;
  let exhausted = false;

  const deviceRecord = device as unknown as Record<string, unknown>;
  const createEncoder = deviceRecord['createCommandEncoder'] as (this: GPUDevice, descriptor?: GPUCommandEncoderDescriptor) => GPUCommandEncoder;

  deviceRecord['createCommandEncoder'] = function createCommandEncoder(this: GPUDevice, descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
    const encoder = createEncoder.call(this, descriptor);
    const encoderRecord = encoder as unknown as Record<string, unknown>;
    const beginPass = encoderRecord['beginRenderPass'] as (this: GPUCommandEncoder, d: GPURenderPassDescriptor) => GPURenderPassEncoder;

    // Every encoder is wrapped, not only the ones inside a timed frame: the
    // engine REUSES one render-pass descriptor object, so a `timestampWrites`
    // left on it by the last timed pass would silently follow the descriptor
    // into warmup/teardown passes and overwrite query values already recorded.
    // The wrapper therefore always writes the member - the injected pair inside
    // the window, `undefined` outside it.
    encoderRecord['beginRenderPass'] = function beginRenderPass(this: GPUCommandEncoder, descriptorArg: GPURenderPassDescriptor): GPURenderPassEncoder {
      // Written through an index signature: under `exactOptionalPropertyTypes`
      // the generated WebGPU types reject assigning `undefined` to the member,
      // which is exactly what clearing it requires.
      const record = descriptorArg as unknown as Record<string, unknown>;

      if (currentFrame < 0) {
        record['timestampWrites'] = undefined;
      } else if (nextQuery + 2 > TIMESTAMP_QUERY_CAPACITY) {
        exhausted = true;
        record['timestampWrites'] = undefined;
      } else {
        passes.push({ frame: currentFrame, begin: nextQuery, end: nextQuery + 1 });
        record['timestampWrites'] = {
          querySet,
          beginningOfPassWriteIndex: nextQuery,
          endOfPassWriteIndex: nextQuery + 1,
        } satisfies GPURenderPassTimestampWrites;
        nextQuery += 2;
      }

      return beginPass.call(this, descriptorArg);
    };

    return encoder;
  };

  return {
    beginFrame(frame: number): void {
      currentFrame = frame;
    },
    endWindow(): void {
      currentFrame = -1;
    },
    async collect(): Promise<{ frameMs: number[]; note: string | null }> {
      if (passes.length === 0) {
        return { frameMs: [], note: 'no render pass was timestamped' };
      }

      const resolved = nextQuery;
      const encoder = createEncoder.call(device, { label: 'bench:timestamp-resolve-encoder' });

      encoder.resolveQuerySet(querySet, 0, resolved, resolveBuffer, 0);
      encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, resolved * 8);
      device.queue.submit([encoder.finish()]);

      await readBuffer.mapAsync(GPUMapMode.READ, 0, resolved * 8);

      // Copied out of the mapped range: `unmap` invalidates the view.
      const raw = BigUint64Array.from(new BigUint64Array(readBuffer.getMappedRange(0, resolved * 8)));

      readBuffer.unmap();

      // Sum the frame's passes: the GPU may execute them back to back or with
      // gaps, and only the executed intervals are this frame's GPU work.
      const perFrame = new Map<number, number>();
      let dropped = 0;

      for (const pass of passes) {
        const begin = raw[pass.begin]!;
        const end = raw[pass.end]!;

        // An unavailable query resolves to zero; a non-increasing pair means the
        // GPU clock was interrupted. Neither is a measurement - drop it rather
        // than fold a bogus interval into the frame.
        if (begin === 0n || end <= begin) {
          dropped++;
          continue;
        }

        perFrame.set(pass.frame, (perFrame.get(pass.frame) ?? 0) + Number(end - begin) / 1e6);
      }

      const notes: string[] = [];

      if (exhausted) {
        notes.push(`timestamp query set exhausted after ${passes.length} passes; later frames carry no GPU time`);
      }

      if (dropped > 0) {
        notes.push(`${dropped} of ${passes.length} timestamp pairs were unavailable and were dropped`);
      }

      return {
        frameMs: [...perFrame.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value),
        note: notes.length > 0 ? notes.join('; ') : null,
      };
    },
  };
};

/**
 * WebGPU per-frame timing source.
 *
 * Reports TWO series, because no single WebGPU clock is both complete and
 * resolving:
 *
 * 1. `frameMs` - hardware `timestamp-query` around the frame's render passes.
 *    Exact and reproducible (a 1k / 10k / 100k / 1M sweep measured
 *    0.004 / 0.007 / 0.045 / 0.412ms with p95 == median to the third decimal),
 *    but it covers pass EXECUTION only: `queue.writeBuffer` is a queue operation
 *    outside every command buffer, so its device copy cannot be bracketed.
 * 2. `queueMs` - `queue.onSubmittedWorkDone` wall clock, with each frame charged
 *    only the interval after the PREVIOUS frame's observed completion
 *    (`doneAt − max(submitAt, previousDoneAt)`). This is the only signal that
 *    sees upload cost, and the only one that can surface a stall.
 *
 * Why `queueMs` is not the frame time, despite being the historical column: it is
 * floored by when the browser OBSERVES the completion, not by when the GPU
 * finished. Two control arms pin that down - a rAF-paced submit that clears the
 * canvas swapchain (2µs of GPU work) reports 0.50ms, and the identical clear into
 * an offscreen texture reports 3.18ms, because a present flushes the device and
 * nothing else does. Real engine frames land in both regimes, which is why the
 * old `frameMsMedian` was bimodal between ~0.6 and ~3.0ms run to run while the
 * GPU work behind it never changed.
 *
 * Why the attribution and not the raw `doneAt − submitAt`: completion is
 * CUMULATIVE, so a frame slow enough to bunch rAF callbacks makes the frames
 * submitted behind it resolve on its completion. Measured on a 1M-node cell, one
 * 26.7ms event was reported by three consecutive frames as 26.70 / 26.98 /
 * 24.65ms; the attribution reports 26.70 / 1.52 / 1.18, keeping the event on the
 * frame that caused it. The attributed value for a frame queued behind a big one
 * is a LOWER bound on its own work - strictly better than counting the big frame
 * again, and disclosed as such in {@link WEBGPU_QUEUE_NOTE}.
 */
export const createWebGpuGpuTimer = (device: GPUDevice): GpuFrameTimer => {
  const timestamps = createTimestampSource(device);
  const pending: Array<Promise<void>> = [];
  const completions: Array<{ submittedAt: number; doneAt: number } | undefined> = [];
  let frame = 0;
  let collectNote: string | null = null;

  return {
    available: timestamps !== null,
    get note(): string | null {
      const base = timestamps === null ? WEBGPU_NO_TIMESTAMP_NOTE : WEBGPU_TIMESTAMP_NOTE;

      return collectNote === null ? base : `${base}; ${collectNote}`;
    },
    async drainSubmittedWork(): Promise<void> {
      // The measurement boundary, and it still earns its place under the
      // timestamp timer: a timestamp pair cannot inherit a backlog, but the
      // `queueMs` series can - the first timed frame's cumulative
      // `onSubmittedWorkDone` would otherwise resolve after warmup work it never
      // did (measured: 128.3ms of backlog moved out of a 1M-node cell's window).
      // It also opens the window on an idle GPU, so the first frames' passes do
      // not execute against warmup contention.
      await device.queue.onSubmittedWorkDone();
    },
    beginFrame(): void {
      // Opens BEFORE `renderFrame`, so every pass the frame encodes is inside
      // this frame's timestamp accounting.
      timestamps?.beginFrame(frame);
    },
    endFrame(): void {
      // renderFrame has already recorded AND submitted this frame's work.
      const submittedAt = performance.now();
      const index = frame++;

      pending.push(
        device.queue.onSubmittedWorkDone().then(() => {
          completions[index] = { submittedAt, doneAt: performance.now() };
        }),
      );
    },
    async collect(): Promise<GpuFrameSamples> {
      await Promise.all(pending);

      timestamps?.endWindow();

      const queueMs: number[] = [];
      let previousDone: number | null = null;

      // Frame order, not completion order: the queue is FIFO, so frame i's
      // completion cannot precede frame i-1's, and charging each frame only the
      // interval past the previous completion partitions the queue's busy time
      // without double-counting it. Clamped at zero so an out-of-order callback
      // can never produce a negative sample.
      for (const completion of completions) {
        if (completion === undefined) {
          continue;
        }

        const start = previousDone === null ? completion.submittedAt : Math.max(completion.submittedAt, previousDone);

        queueMs.push(Math.max(0, completion.doneAt - start));
        previousDone = completion.doneAt;
      }

      if (timestamps === null) {
        return { frameMs: [], queueMs };
      }

      const resolved = await timestamps.collect();

      collectNote = resolved.note;

      return { frameMs: resolved.frameMs, queueMs };
    },
  };
};
