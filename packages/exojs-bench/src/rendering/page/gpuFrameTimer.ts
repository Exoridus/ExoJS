import type { GpuFrameSamples, GpuTimingDiagnostics } from '../gpuTiming';

export type { GpuFrameSamples, GpuTimingDiagnostics, GpuTimingSource } from '../gpuTiming';

/**
 * Per-frame GPU-time sources shared by every page this package serves: the
 * Playwright-driven matrix harness (`page/harness.ts`) and the manual DPR probe
 * (`dpr-probe/page/probe.ts`). Both pages share measurement scope and sample
 * validity rules.
 */

/** Note recorded on a cell whose full-frame time came from rAF cadence, not a GPU timer. */
export const NO_GPU_TIMER_NOTE = 'frame time from rAF delta; no GPU timer';

/**
 * Note recorded on a WebGPU cell whose frame time comes from
 * `timestamp-query` writes around the frame's render passes.
 *
 * The exclusion is the load-bearing half: `queue.writeBuffer` is a QUEUE
 * operation, not a command-buffer command, so its device copy never sits inside
 * a render pass. Render-pass timestamp intervals therefore exclude it.
 */
export const WEBGPU_TIMESTAMP_NOTE =
  "frame time from WebGPU timestamp-query around the frame's render passes (render-pass execution only; queue.writeBuffer upload copies and commands outside render passes are not included). Not directly comparable to the WebGL2 elapsed query, which brackets the frame's GL command stream including uploads";

/**
 * Note recorded on a WebGPU cell that could not obtain `timestamp-query`, so it
 * has no GPU query clock. Queue-completion observation is a different signal
 * and cannot fill the missing execution-time sample.
 */
export const WEBGPU_NO_TIMESTAMP_NOTE =
  'WebGPU device exposes no timestamp-query feature, so this backend has no hardware GPU clock here; frame time falls back to the rAF present cadence and queueMs* is reported separately';

/**
 * Note recorded alongside every WebGPU cell's `queueMs*` pair, stating exactly
 * what that column observes and why it is not execution time.
 */
export const WEBGPU_QUEUE_NOTE =
  'queueMs* = CPU-observed queue-completion intervals (doneAt - max(submitAt, previous doneAt)), from queue.onSubmittedWorkDone. They include scheduling and completion-observation delays, can omit work completed before the observation starts, and do not bound individual frames when callbacks coalesce. They are not GPU execution time';

const timingStatus = (attempted: number, valid: number, failed: boolean): GpuTimingDiagnostics['status'] => {
  if (failed) {
    return 'failed';
  }

  if (valid === 0) {
    return 'unavailable';
  }

  return valid === attempted ? 'complete' : 'partial';
};

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
  /** Release query resources and restore wrappers. Safe after collect or a failed frame. */
  dispose?(): void;
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
    return {
      frameMs: [],
      queueMs: [],
      frameIndices: [],
      queueFrameIndices: [],
      timing: {
        source: 'none',
        status: 'unavailable',
        attemptedFrames: 0,
        validFrames: 0,
        invalidFrames: 0,
        unresolvedFrames: 0,
        skippedFrames: 0,
      },
    };
  },
};

/** Minimal surface of `EXT_disjoint_timer_query_webgl2` this harness consumes. */
interface DisjointTimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

const QUERY_POLL_INTERVAL_MS = 4;
const QUERY_POLL_ATTEMPTS = 250;
const MAX_PENDING_WEBGL_QUERIES = 128;

/** Cleanup must not turn an unavailable optional timer into a failed CPU measurement. */
const bestEffort = (operation: () => void): void => {
  try {
    operation();
  } catch {
    // Device/context loss may make resource cleanup fail too.
  }
};

/**
 * GPU elapsed queries when `EXT_disjoint_timer_query_webgl2` is exposed.
 * One `TIME_ELAPSED` query may be active at a time; unresolved queries remain
 * pending without delaying the measured frame. Every GL call is guarded: any
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
  const pending: Array<{ query: WebGLQuery; frame: number }> = [];
  const samplesMs: number[] = [];
  const frameIndices: number[] = [];
  let active: { query: WebGLQuery; frame: number } | null = null;
  let failed = false;
  let disposed = false;
  let attemptedFrames = 0;
  let disjointCount = 0;
  let invalidFrames = 0;
  let unresolvedFrames = 0;
  let skippedFrames = 0;

  const discardPending = (): void => {
    for (const { query } of pending.splice(0)) {
      bestEffort(() => gl.deleteQuery(query));
    }
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;

    if (active !== null) {
      const { query } = active;

      bestEffort(() => gl.endQuery(timeElapsedTarget));
      bestEffort(() => gl.deleteQuery(query));
      active = null;
      invalidFrames++;
    }

    unresolvedFrames += pending.length;
    discardPending();
  };

  const fail = (): void => {
    failed = true;
    dispose();
  };

  const drain = (): void => {
    // GPU_DISJOINT_EXT describes the interval since the previous read. Reading
    // it once per query would clear it after the first discarded result and
    // incorrectly accept other queries from the same interrupted interval.
    if (gl.getParameter(disjointParam) === true) {
      disjointCount += pending.length;
      invalidFrames += pending.length;
      discardPending();

      return;
    }

    while (pending.length > 0) {
      const { query, frame } = pending[0]!;
      const ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true;

      if (!ready) {
        return;
      }

      const elapsedNs = gl.getQueryParameter(query, gl.QUERY_RESULT) as unknown;

      if (typeof elapsedNs === 'number' && Number.isFinite(elapsedNs) && elapsedNs > 0) {
        samplesMs.push(elapsedNs / 1e6);
        frameIndices.push(frame);
      } else {
        invalidFrames++;
      }

      pending.shift();
      bestEffort(() => gl.deleteQuery(query));
    }
  };

  return {
    available: true,
    get note(): string | null {
      const notes: string[] = [];

      if (disjointCount > 0) {
        notes.push(`${String(disjointCount)} disjoint GPU frame(s) discarded`);
      }

      if (unresolvedFrames > 0) {
        notes.push(`${String(unresolvedFrames)} GPU frame(s) unresolved`);
      }

      if (invalidFrames > disjointCount) {
        notes.push(`${String(invalidFrames - disjointCount)} GPU frame(s) invalid or below timer resolution`);
      }

      if (skippedFrames > 0) {
        notes.push(`${String(skippedFrames)} GPU frame(s) skipped because the timer was unavailable or its query queue was full`);
      }

      if (failed) {
        notes.push('GPU timer failed');
      }

      return notes.length > 0 ? notes.join('; ') : null;
    },
    async drainSubmittedWork(): Promise<void> {
      // A TIME_ELAPSED query measures only the commands between its own
      // begin/end, so a timed frame's sample structurally cannot absorb work
      // submitted during warmup. Nothing to wait for.
    },
    beginFrame(): void {
      const frame = attemptedFrames++;

      if (failed || disposed) {
        skippedFrames++;

        return;
      }

      try {
        drain();

        if (pending.length >= MAX_PENDING_WEBGL_QUERIES) {
          skippedFrames++;

          return;
        }

        const query = gl.createQuery();

        if (query === null) {
          skippedFrames++;
          fail();

          return;
        }

        active = { query, frame };
        gl.beginQuery(timeElapsedTarget, query);
      } catch {
        if (active === null) {
          skippedFrames++;
        }

        fail();
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
        fail();
      }
    },
    async collect(): Promise<GpuFrameSamples> {
      if (!failed) {
        try {
          for (let poll = 0; pending.length > 0 && poll < QUERY_POLL_ATTEMPTS; poll++) {
            drain();

            if (pending.length > 0) {
              // WebGL query availability cannot change until control returns
              // to the event loop; a synchronous polling loop cannot progress.
              await new Promise<void>(resolve => {
                setTimeout(resolve, QUERY_POLL_INTERVAL_MS);
              });
            }
          }
        } catch {
          fail();
        }
      }

      dispose();

      return {
        frameMs: samplesMs,
        queueMs: [],
        frameIndices,
        queueFrameIndices: [],
        timing: {
          source: 'webgl2-time-elapsed',
          status: timingStatus(attemptedFrames, samplesMs.length, failed),
          attemptedFrames,
          validFrames: samplesMs.length,
          invalidFrames,
          unresolvedFrames,
          skippedFrames,
        },
      };
    },
    dispose,
  };
};

/**
 * Two slots per render pass, allocated once per window and never reused while
 * in flight. Exhaustion skips every affected frame in full without blocking the
 * measured path or reporting a partial pass sum.
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

    return (original as (this: GPUAdapter, d: GPUDeviceDescriptor) => unknown).call(this, {
      ...descriptor,
      requiredFeatures: [...features],
    });
  };
};

/** A frame's hardware timestamp pairs, in the order the passes were encoded. */
interface TimestampPass {
  readonly frame: number;
  readonly begin: number;
  readonly end: number;
  submissions: number;
  submittedFrame: number | null;
}

interface TimestampFrame {
  readonly passes: TimestampPass[];
  skipped: boolean;
}

interface TimestampCommands {
  readonly passes: TimestampPass[];
  unmeasuredPasses: boolean;
}

interface TimestampResult {
  readonly frameMs: number[];
  readonly frameIndices: number[];
  readonly timing: GpuTimingDiagnostics;
  readonly note: string | null;
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
  endFrame(): void;
  endWindow(): void;
  collect(): Promise<TimestampResult>;
  dispose(): void;
} | null => {
  // `features` is mandatory on a real `GPUDevice`; the optional chain covers the
  // degrade path where an arm hands back an object that is not one.
  if (device.features?.has('timestamp-query') !== true) {
    return null;
  }

  const frames = new Map<number, TimestampFrame>();
  const commandPasses = new WeakMap<GPUCommandBuffer, TimestampCommands>();
  const restores: Array<() => void> = [];
  const releases: Array<() => void> = [];
  let currentFrame = -1;
  let nextQuery = 0;
  let exhausted = false;
  let conflictingQueries = false;
  let disposed = false;
  let collected: Promise<TimestampResult> | null = null;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    currentFrame = -1;

    for (const restore of restores.splice(0).reverse()) {
      bestEffort(restore);
    }

    for (const release of releases.splice(0).reverse()) {
      bestEffort(release);
    }
  };

  let resources: { querySet: GPUQuerySet; resolveBuffer: GPUBuffer; readBuffer: GPUBuffer };

  try {
    const querySet = device.createQuerySet({ type: 'timestamp', count: TIMESTAMP_QUERY_CAPACITY, label: 'bench:frame-timestamps' });

    releases.push(() => querySet.destroy());

    const resolveBuffer = device.createBuffer({
      size: TIMESTAMP_QUERY_CAPACITY * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      label: 'bench:timestamp-resolve',
    });

    releases.push(() => resolveBuffer.destroy());

    const readBuffer = device.createBuffer({
      size: TIMESTAMP_QUERY_CAPACITY * 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'bench:timestamp-readback',
    });

    releases.push(
      () => readBuffer.destroy(),
      () => readBuffer.unmap(),
    );
    resources = { querySet, resolveBuffer, readBuffer };
  } catch (error) {
    dispose();

    throw error;
  }

  const { querySet, resolveBuffer, readBuffer } = resources;

  const deviceRecord = device as unknown as Record<string, unknown>;
  const createEncoder = deviceRecord['createCommandEncoder'] as (
    this: GPUDevice,
    descriptor?: GPUCommandEncoderDescriptor,
  ) => GPUCommandEncoder;

  const wrapEncoder = function createCommandEncoder(this: GPUDevice, descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
    const encoder = createEncoder.call(this, descriptor);
    const encoderRecord = encoder as unknown as Record<string, unknown>;
    const beginPass = encoderRecord['beginRenderPass'] as (this: GPUCommandEncoder, d: GPURenderPassDescriptor) => GPURenderPassEncoder;
    const finish = encoder.finish;
    const commands: TimestampCommands = { passes: [], unmeasuredPasses: false };

    encoderRecord['beginRenderPass'] = function beginRenderPass(
      this: GPUCommandEncoder,
      descriptorArg: GPURenderPassDescriptor,
    ): GPURenderPassEncoder {
      if (currentFrame < 0 || disposed) {
        commands.unmeasuredPasses = true;

        return beginPass.call(this, descriptorArg);
      }

      const frame = frames.get(currentFrame)!;

      if (nextQuery + 2 > TIMESTAMP_QUERY_CAPACITY || descriptorArg.timestampWrites !== undefined) {
        frame.skipped = true;
        conflictingQueries ||= descriptorArg.timestampWrites !== undefined;
        exhausted ||= nextQuery + 2 > TIMESTAMP_QUERY_CAPACITY;
        commands.unmeasuredPasses = true;

        return beginPass.call(this, descriptorArg);
      }

      const pass: TimestampPass = { frame: currentFrame, begin: nextQuery, end: nextQuery + 1, submissions: 0, submittedFrame: null };

      frame.passes.push(pass);
      commands.passes.push(pass);
      nextQuery += 2;

      // Descriptors may be reused or frozen. Mutating one would leak our query
      // indices into later untimed passes or overwrite caller-owned queries.
      return beginPass.call(this, {
        ...descriptorArg,
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: pass.begin,
          endOfPassWriteIndex: pass.end,
        },
      });
    };

    encoder.finish = function finishEncoder(this: GPUCommandEncoder, descriptorArg?: GPUCommandBufferDescriptor): GPUCommandBuffer {
      const buffer = finish.call(this, descriptorArg);

      commandPasses.set(buffer, commands);

      return buffer;
    };

    return encoder;
  };

  const submit = device.queue.submit;

  const wrapSubmit = function submitCommands(this: GPUQueue, commandBuffers: Iterable<GPUCommandBuffer>): undefined {
    const submitted = Array.isArray(commandBuffers) ? commandBuffers : [...commandBuffers];

    submit.call(this, submitted);

    for (const commandBuffer of submitted) {
      const commands = commandPasses.get(commandBuffer);
      const frame = frames.get(currentFrame);

      if (frame !== undefined && (commands === undefined || commands.unmeasuredPasses)) {
        frame.skipped = true;
      }

      for (const pass of commands?.passes ?? []) {
        if (frame !== undefined && pass.frame !== currentFrame) {
          frame.skipped = true;
        }

        pass.submissions++;
        pass.submittedFrame = currentFrame;
      }
    }
  };

  try {
    deviceRecord['createCommandEncoder'] = wrapEncoder;
    restores.push(() => {
      if (deviceRecord['createCommandEncoder'] === wrapEncoder) {
        deviceRecord['createCommandEncoder'] = createEncoder;
      }
    });
    device.queue.submit = wrapSubmit;
    restores.push(() => {
      if (device.queue.submit === wrapSubmit) {
        device.queue.submit = submit;
      }
    });
  } catch (error) {
    dispose();

    throw error;
  }

  const collect = async (): Promise<TimestampResult> => {
    const frameMs: number[] = [];
    const frameIndices: number[] = [];
    const notes: string[] = [];
    let invalidFrames = 0;
    let skippedFrames = 0;
    let unresolvedFrames = 0;
    let failed = false;

    try {
      if (disposed) {
        throw new Error('timestamp timer was disposed before collection');
      }

      let raw = new BigUint64Array(0);

      if (nextQuery > 0) {
        const encoder = createEncoder.call(device, { label: 'bench:timestamp-resolve-encoder' });

        encoder.resolveQuerySet(querySet, 0, nextQuery, resolveBuffer, 0);
        encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, nextQuery * 8);
        device.queue.submit([encoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ, 0, nextQuery * 8);

        raw = BigUint64Array.from(new BigUint64Array(readBuffer.getMappedRange(0, nextQuery * 8)));
        readBuffer.unmap();
      }

      for (const [frameIndex, frame] of frames) {
        if (frame.skipped || frame.passes.length === 0) {
          skippedFrames++;

          continue;
        }

        let sumMs = 0;
        let valid = true;

        for (const pass of frame.passes) {
          const begin = raw[pass.begin]!;
          const end = raw[pass.end]!;

          // Equal timestamps can be clock quantization, not a disjoint event.
          // Either way, omitting that pass would bias the sum downward, so only
          // a complete frame with positive, submitted pass intervals is usable.
          if (pass.submissions !== 1 || pass.submittedFrame !== frameIndex || begin === 0n || end <= begin) {
            valid = false;
            break;
          }

          sumMs += Number(end - begin) / 1e6;
        }

        if (valid) {
          frameIndices.push(frameIndex);
          frameMs.push(sumMs);
        } else {
          invalidFrames++;
        }
      }
    } catch (error) {
      failed = true;
      unresolvedFrames = frames.size;
      notes.push(`timestamp timer failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      dispose();
    }

    if (exhausted) {
      notes.push('timestamp query capacity exhausted; every affected frame was omitted in full');
    }

    if (conflictingQueries) {
      notes.push('caller-owned timestamp queries preserved; affected frames were omitted');
    }

    if (invalidFrames > 0) {
      notes.push(`${invalidFrames} GPU frame(s) discarded for incomplete, invalid or resolution-limited timestamp pairs`);
    }

    if (skippedFrames > 0) {
      notes.push(`${skippedFrames} GPU frame(s) had no complete timestamp coverage`);
    }

    return {
      frameMs,
      frameIndices,
      timing: {
        source: 'webgpu-render-pass-timestamps',
        status: timingStatus(frames.size, frameMs.length, failed),
        attemptedFrames: frames.size,
        validFrames: frameMs.length,
        invalidFrames,
        unresolvedFrames,
        skippedFrames,
      },
      note: notes.length > 0 ? notes.join('; ') : null,
    };
  };

  return {
    beginFrame(frame: number): void {
      currentFrame = frame;
      frames.set(frame, { passes: [], skipped: false });
    },
    endFrame(): void {
      currentFrame = -1;
    },
    endWindow(): void {
      currentFrame = -1;
    },
    collect(): Promise<TimestampResult> {
      currentFrame = -1;

      return (collected ??= collect());
    },
    dispose,
  };
};

/** Render-pass query intervals and separate CPU-observed queue-completion intervals. */
export const createWebGpuGpuTimer = (device: GPUDevice): GpuFrameTimer => {
  let timestamps: ReturnType<typeof createTimestampSource> = null;
  let initializationFailure: string | null = null;

  try {
    timestamps = createTimestampSource(device);
  } catch (error) {
    initializationFailure = `timestamp timer initialization failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const pending: Array<Promise<void>> = [];
  const completions: Array<{ submittedAt: number; doneAt: number } | undefined> = [];
  let frame = 0;
  let queueFailures = 0;
  let collectNote: string | null = null;

  return {
    available: timestamps !== null,
    get note(): string | null {
      const base = initializationFailure ?? (timestamps === null ? WEBGPU_NO_TIMESTAMP_NOTE : WEBGPU_TIMESTAMP_NOTE);
      const notes = [base, collectNote, queueFailures > 0 ? `${queueFailures} queue completion observation(s) failed` : null];

      return notes.filter((note): note is string => note !== null).join('; ');
    },
    async drainSubmittedWork(): Promise<void> {
      // The first cumulative completion observation must not inherit warmup
      // backlog. This wait occurs outside the measured frame window.
      try {
        await device.queue.onSubmittedWorkDone();
      } catch {
        queueFailures++;
      }
    },
    beginFrame(): void {
      // Opens BEFORE `renderFrame`, so every pass the frame encodes is inside
      // this frame's timestamp accounting.
      timestamps?.beginFrame(frame);
    },
    endFrame(): void {
      timestamps?.endFrame();

      // renderFrame has already recorded AND submitted this frame's work.
      const submittedAt = performance.now();
      const index = frame++;

      try {
        pending.push(
          device.queue.onSubmittedWorkDone().then(
            () => {
              completions[index] = { submittedAt, doneAt: performance.now() };
            },
            () => {
              queueFailures++;
            },
          ),
        );
      } catch {
        queueFailures++;
      }
    },
    async collect(): Promise<GpuFrameSamples> {
      timestamps?.endWindow();

      await Promise.all(pending);

      const queueMs: number[] = [];
      const queueFrameIndices: number[] = [];
      let previousDone: number | null = null;

      // Partition observed completion intervals without counting overlap twice.
      // These callback times do not establish per-frame GPU execution bounds.
      for (const [index, completion] of completions.entries()) {
        if (completion === undefined) {
          continue;
        }

        const start = previousDone === null ? completion.submittedAt : Math.max(completion.submittedAt, previousDone);

        queueMs.push(Math.max(0, completion.doneAt - start));
        queueFrameIndices.push(index);
        previousDone = completion.doneAt;
      }

      if (timestamps === null) {
        return {
          frameMs: [],
          queueMs,
          frameIndices: [],
          queueFrameIndices,
          timing: {
            source: initializationFailure === null ? 'none' : 'webgpu-render-pass-timestamps',
            status: initializationFailure === null ? 'unavailable' : 'failed',
            attemptedFrames: frame,
            validFrames: 0,
            invalidFrames: 0,
            unresolvedFrames: 0,
            skippedFrames: frame,
          },
        };
      }

      const resolved = await timestamps.collect();

      collectNote = resolved.note;

      return { frameMs: resolved.frameMs, queueMs, frameIndices: resolved.frameIndices, queueFrameIndices, timing: resolved.timing };
    },
    dispose(): void {
      timestamps?.dispose();
    },
  };
};
