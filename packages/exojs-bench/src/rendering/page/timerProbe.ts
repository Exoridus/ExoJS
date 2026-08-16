/**
 * Timer-methodology probe for the WebGPU benchmark frame-time metric.
 *
 * `stallProbe.ts` answers "what does the engine do on this frame". This probe
 * answers a different question: "what does the harness's WebGPU frame-time
 * SAMPLE actually measure". It therefore records the full event timeline of a
 * timed frame —
 *
 * ```text
 * rAF callback timestamp
 * CPU frame begin / end
 * first and last queue.submit observed
 * submitAt (the harness's own bracket open)
 * onSubmittedWorkDone completion observed  -> doneAt
 * previous frame's doneAt
 * hardware GPU timestamps around every render pass of the frame
 * ```
 *
 * — plus a set of scheduler CONTROL measurements (`performance.now` resolution,
 * microtask latency, completion latency on a provably idle queue, rAF cadence)
 * that separate GPU execution from completion-callback overhead.
 *
 * Everything here is measurement-only. No engine source is modified: render-pass
 * timestamps are injected by wrapping the live `GPUDevice`'s
 * `createCommandEncoder`/`beginRenderPass`/`finish`, and the `timestamp-query`
 * feature is obtained by wrapping `GPUAdapter.prototype.requestDevice` before the
 * engine asks for its device. The same prototype-patching technique the stall
 * stall probe uses.
 *
 * @internal Test/perf-only.
 */

/// <reference types="@webgpu/types" />

import { DerivedSelectionState } from '#rendering/plan/DerivedSelectionState';

import { createExoJsAdapter } from '../adapters/exojs';
import { ARCHETYPES } from '../archetypes';
import type { Backend } from '../EngineAdapter';

/** Design-space viewport of the probe canvas; mirrors `harness.ts`'s STAGE_*. */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

/** Same fixed RNG seed the matrix harness uses, so scenes are identical. */
const SEED = 0xc0ffee;

/**
 * Timestamps a single command encoder may carry. `resolveQuerySet` writes into
 * the destination buffer at a 256-byte-aligned offset, so each encoder is given
 * its own 256-byte slot = 32 timestamps = 16 render passes. The engine opens one
 * pass per encoder on every archetype this probe runs, so the cap is headroom.
 */
const TIMESTAMPS_PER_ENCODER = 32;
/** Bytes one encoder's resolved timestamps occupy (`resolveQuerySet` alignment). */
const RESOLVE_STRIDE_BYTES = 256;
/** Encoders whose passes can be timestamped in one run. */
const MAX_TIMED_ENCODERS = 512;
/** Timestamp query slots. Reused across encoders; a run that exhausts them stops instrumenting. */
const QUERY_CAPACITY = 2048;

/** Frame pacing under test. */
export type TimerProbeMode =
  /** rAF-paced, submits overlap freely — what the matrix harness does. */
  | 'pipelined'
  /** rAF-paced, but each frame's queue work is awaited before the next frame runs. */
  | 'serialized'
  /**
   * Diagnostic control arm: rAF-paced, but the frame submits ONE EMPTY command
   * buffer instead of rendering. The engine, the swapchain and every draw are out
   * of the picture, so whatever `onSubmittedWorkDone` still reports here is the
   * floor the metric carries from the browser's submit/completion plumbing under
   * rAF pacing — not GPU work.
   */
  | 'idle-empty'
  /**
   * Diagnostic control arm: rAF-paced, one render pass that only CLEARS the
   * canvas swapchain texture. Nanoseconds of GPU work, but the submit touches the
   * presented surface — which isolates presentation coupling from engine work.
   */
  | 'canvas-clear'
  /**
   * Diagnostic control arm: {@link canvas-clear}, but clearing a probe-owned
   * OFFSCREEN texture instead of the swapchain. Identical GPU work, no
   * presentation — the A/B partner that names presentation as the cause.
   */
  | 'offscreen-clear';

/** One probe run's inputs. */
export interface TimerProbeSpec {
  /** Archetype id. */
  readonly archetype: string;
  /** Leaf count laid out over the archetype's world. */
  readonly nodeCount: number;
  /** Backend under test. */
  readonly backend: Backend;
  /** ExoJS arm under test. */
  readonly config: 'current' | 'retained';
  /** Untimed frames run before the series starts. */
  readonly warmupFrames: number;
  /** Frames recorded into the series. */
  readonly timedFrames: number;
  /** Frame pacing under test. */
  readonly mode: TimerProbeMode;
  /** Await `queue.onSubmittedWorkDone()` once after warmup (the shipped B1a boundary). */
  readonly drainAfterWarmup: boolean;
  /** Request `timestamp-query` and bracket every render pass with hardware timestamps. */
  readonly timestampQueries: boolean;
  /** Run the scheduler control measurements (idle-queue latency, microtask latency, clock resolution). */
  readonly controls: boolean;
  /** Control-measurement repetitions. */
  readonly controlSamples: number;
}

/** One recorded frame. All times are milliseconds unless the name says otherwise. */
export interface TimerFrameRecord {
  /** Index within the timed window. */
  frame: number;
  /** The `requestAnimationFrame` callback's own timestamp, relative to the window epoch. */
  rafAtMs: number;
  /** Interval to the previous rAF callback (0 on the first). */
  rafDeltaMs: number;
  /** `performance.now()` when the frame's CPU work started, relative to the epoch. */
  cpuBeginAtMs: number;
  /** `mutate` + `renderFrame`, i.e. the harness's primary CPU metric. */
  cpuMs: number;
  /** First `queue.submit` observed inside this frame, relative to the epoch; null when the frame submitted nothing. */
  firstSubmitAtMs: number | null;
  /** Last `queue.submit` observed inside this frame, relative to the epoch; null when the frame submitted nothing. */
  lastSubmitAtMs: number | null;
  /** `queue.submit` calls this frame. */
  submits: number;
  /**
   * The harness's own bracket open: `performance.now()` immediately after
   * `renderFrame` returned, which is where `createWebGpuGpuTimer.endFrame` reads
   * its `submittedAt`.
   */
  submitAtMs: number;
  /** When this frame's `onSubmittedWorkDone` callback ran, on the same clock. */
  doneAtMs: number | null;
  /**
   * Sum over this frame's render passes of (end timestamp − begin timestamp),
   * from the hardware `timestamp-query` writes. Null when timestamps are off or
   * unavailable. Covers render-pass execution ONLY — `queue.writeBuffer` copies
   * are queue operations outside any command buffer and cannot be bracketed.
   */
  gpuPassMs: number | null;
  /** Last pass end − first pass begin across this frame's passes; null as above. */
  gpuSpanMs: number | null;
  /** Render passes timestamped this frame. */
  timedPasses: number;

  /** Selections this frame ran (0 on a tier-0 replay, 1 on a re-selection). */
  selections: number;
  /** Items that took a slot this frame. */
  entered: number;
  /** `queue.writeBuffer` bytes this frame. */
  writeBufferBytes: number;
}

/** Scheduler / clock control measurements, taken in the same page and process as the series. */
export interface TimerControlResult {
  /** Smallest non-zero `performance.now()` delta observed in a tight loop (ms). */
  readonly nowMinDeltaMs: number;
  /** Distinct `performance.now()` deltas observed, most frequent first, as `[deltaMs, count]`. */
  readonly nowDeltaHistogram: ReadonlyArray<readonly [number, number]>;
  /** Whether the page is cross-origin isolated (which lifts Chromium's 100µs clock clamp). */
  readonly crossOriginIsolated: boolean;
  /** `await Promise.resolve()` round-trip, one entry per sample. */
  readonly microtaskMs: readonly number[];
  /** `onSubmittedWorkDone()` on a queue that was just drained — pure completion-callback overhead. */
  readonly idleQueueMs: readonly number[];
  /** Submit one EMPTY command buffer, then await completion. The floor of any real frame sample. */
  readonly emptySubmitMs: readonly number[];
  /** rAF callback intervals measured with no rendering at all. */
  readonly rafIdleDeltaMs: readonly number[];
  /** Adapter identity as reported by `GPUAdapter.info`, when exposed. */
  readonly adapterInfo: Record<string, string>;
  /** Device features relevant to timing. */
  readonly features: readonly string[];
  /** Whether resolved timestamp values look quantized (all multiples of 100µs). */
  readonly timestampsQuantized: boolean | null;
}

/** Everything one probe run returns. */
export interface TimerProbeResult {
  readonly spec: TimerProbeSpec;
  readonly frames: readonly TimerFrameRecord[];
  /** Wall clock spent awaiting the post-warmup queue drain; 0 when not requested. */
  readonly warmupDrainMs: number;
  /** Wall clock the warmup phase took. */
  readonly warmupMs: number;
  /** Control measurements, or null when `spec.controls` was false. */
  readonly controls: TimerControlResult | null;
  /** Notes the run wants disclosed (missing feature, exhausted query set, validation error, ...). */
  readonly notes: readonly string[];
}

/** A patch that can be undone. */
type Restore = () => void;

/** Replace one method, returning the undo. */
const patchMethod = (target: Record<string, unknown>, name: string, make: (original: (...args: never[]) => unknown) => (...args: never[]) => unknown): Restore => {
  const original = target[name];

  if (typeof original !== 'function') {
    return (): void => {
      /* nothing to restore */
    };
  }

  target[name] = make(original as (...args: never[]) => unknown);

  return (): void => {
    target[name] = original;
  };
};

/**
 * Make every `requestDevice` on this page ask for `timestamp-query` when the
 * adapter has it, so the device the ENGINE creates carries the feature. The
 * engine builds its own descriptor (`WebGpuBackend`), so the feature cannot be
 * added after the fact — a device's feature set is immutable.
 *
 * Additive only: the engine's own `requiredFeatures` are preserved.
 */
const patchRequestDeviceForTimestamps = (): Restore => {
  const adapterPrototype = (globalThis as unknown as { GPUAdapter?: { prototype: Record<string, unknown> } }).GPUAdapter;

  if (adapterPrototype === undefined) {
    return (): void => {
      /* no WebGPU on this page */
    };
  }

  return patchMethod(adapterPrototype.prototype, 'requestDevice', original =>
    function requestDevice(this: GPUAdapter, ...args: never[]): unknown {
      const descriptor = (args[0] as GPUDeviceDescriptor | undefined) ?? {};
      const features = new Set<GPUFeatureName>(descriptor.requiredFeatures ?? []);

      if (this.features.has('timestamp-query')) {
        features.add('timestamp-query');
      }

      const next = { ...descriptor, requiredFeatures: [...features] } as GPUDeviceDescriptor;

      return (original as (this: GPUAdapter, d: GPUDeviceDescriptor) => unknown).call(this, next);
    },
  );
};

/** Per-frame accumulators; reset at the top of every timed frame. */
interface FrameCounters {
  selections: number;
  entered: number;
  writeBufferBytes: number;
  submits: number;
  firstSubmitAt: number | null;
  lastSubmitAt: number | null;
}

const newFrameCounters = (): FrameCounters => ({
  selections: 0,
  entered: 0,
  writeBufferBytes: 0,
  submits: 0,
  firstSubmitAt: null,
  lastSubmitAt: null,
});

/** Byte length of a `writeBuffer` payload, honouring the explicit-size overload. */
const writeBufferBytes = (args: readonly unknown[]): number => {
  const size = args[4];
  const data = args[2];

  if (typeof size === 'number') {
    const elementSize = ArrayBuffer.isView(data) && !(data instanceof DataView) ? ((data as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT ?? 1) : 1;

    return size * elementSize;
  }

  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }

  return ArrayBuffer.isView(data) ? data.byteLength : 0;
};

/** One command encoder's timestamp bookkeeping. */
interface EncoderTimestamps {
  /** Slot index in the resolve buffer (`slot * RESOLVE_STRIDE_BYTES`). */
  readonly slot: number;
  /** First query index this encoder wrote. */
  readonly firstQuery: number;
  /** Query indices written so far. */
  count: number;
}

/**
 * Hardware render-pass timestamps for one run.
 *
 * WebGPU's only externally-wireable GPU clock is `timestampWrites` on a render-
 * pass descriptor. The engine's `WebGpuPassCoordinator` builds that descriptor
 * and hands it straight to `encoder.beginRenderPass`, so wrapping the encoder is
 * enough to inject the writes without touching engine source.
 *
 * What this CANNOT cover, and the reason it is not a drop-in "GPU frame time":
 * `queue.writeBuffer` is a queue operation, not a command-buffer command. Its
 * copy never appears inside a render pass, so no timestamp pair can bracket it.
 * On an upload-heavy frame the pass timestamps therefore report the DRAW cost
 * and omit the upload cost — which is exactly the work the queue-completion
 * wall clock does see.
 */
interface TimestampRig {
  readonly available: boolean;
  readonly restores: readonly Restore[];
  /** Begin a frame's timestamp accounting; subsequent encoders belong to it. */
  beginFrame(frame: number): void;
  /** Resolve every timestamp recorded so far and return per-frame sums. */
  collect(): Promise<Map<number, { sumMs: number; spanMs: number; passes: number }>>;
  /** Disclosure notes accumulated during the run. */
  readonly notes: readonly string[];
}

const createTimestampRig = (device: GPUDevice): TimestampRig => {
  const notes: string[] = [];

  if (!device.features.has('timestamp-query')) {
    return {
      available: false,
      restores: [],
      beginFrame(): void {
        /* unavailable */
      },
      async collect(): Promise<Map<number, { sumMs: number; spanMs: number; passes: number }>> {
        return new Map();
      },
      notes: ['device does not expose the timestamp-query feature; hardware GPU timestamps are absent'],
    };
  }

  const querySet = device.createQuerySet({ type: 'timestamp', count: QUERY_CAPACITY, label: 'timer-probe:timestamps' });
  const resolveBuffer = device.createBuffer({
    size: MAX_TIMED_ENCODERS * RESOLVE_STRIDE_BYTES,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    label: 'timer-probe:resolve',
  });
  const readBuffer = device.createBuffer({
    size: MAX_TIMED_ENCODERS * RESOLVE_STRIDE_BYTES,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    label: 'timer-probe:readback',
  });

  /** Which frame each encoder slot belongs to. */
  const slotFrame: number[] = [];
  const restores: Restore[] = [];
  let currentFrame = -1;
  let nextSlot = 0;
  let nextQuery = 0;
  let exhausted = false;

  const deviceRecord = device as unknown as Record<string, unknown>;

  restores.push(
    patchMethod(deviceRecord, 'createCommandEncoder', original =>
      function createCommandEncoder(this: GPUDevice, ...args: never[]): unknown {
        const encoder = (original as (this: GPUDevice, ...a: never[]) => unknown).apply(this, args) as GPUCommandEncoder;

        if (currentFrame < 0) {
          return encoder;
        }

        if (nextSlot >= MAX_TIMED_ENCODERS || nextQuery + TIMESTAMPS_PER_ENCODER > QUERY_CAPACITY) {
          if (!exhausted) {
            exhausted = true;
            notes.push(`timestamp capacity exhausted after ${nextSlot} encoders; later frames carry no hardware GPU time`);
          }

          return encoder;
        }

        const book: EncoderTimestamps = { slot: nextSlot, firstQuery: nextQuery, count: 0 };

        slotFrame[nextSlot] = currentFrame;
        nextSlot++;
        nextQuery += TIMESTAMPS_PER_ENCODER;

        const encoderRecord = encoder as unknown as Record<string, unknown>;

        // Per-encoder wrappers are not restore-tracked: encoders are per-frame
        // throwaways, and restoring `createCommandEncoder` stops all injection.
        patchMethod(encoderRecord, 'beginRenderPass', beginOriginal =>
          function beginRenderPass(this: GPUCommandEncoder, ...passArgs: never[]): unknown {
            // Written through an index signature: the engine's reused descriptor
            // is typed under `exactOptionalPropertyTypes`, where clearing the
            // member to `undefined` is not assignable.
            const descriptor = passArgs[0] as unknown as Record<string, unknown>;

            if (book.count + 2 <= TIMESTAMPS_PER_ENCODER) {
              descriptor['timestampWrites'] = {
                querySet,
                beginningOfPassWriteIndex: book.firstQuery + book.count,
                endOfPassWriteIndex: book.firstQuery + book.count + 1,
              } satisfies GPURenderPassTimestampWrites;
              book.count += 2;
            } else {
              // The engine REUSES one descriptor object across passes, so a stale
              // `timestampWrites` would re-write query indices already written in
              // this submit — a validation error. Clear it explicitly.
              descriptor['timestampWrites'] = undefined;
            }

            return (beginOriginal as (this: GPUCommandEncoder, ...a: never[]) => unknown).apply(this, passArgs);
          },
        );

        patchMethod(encoderRecord, 'finish', finishOriginal =>
          function finish(this: GPUCommandEncoder, ...finishArgs: never[]): unknown {
            if (book.count > 0) {
              this.resolveQuerySet(querySet, book.firstQuery, book.count, resolveBuffer, book.slot * RESOLVE_STRIDE_BYTES);
            }

            return (finishOriginal as (this: GPUCommandEncoder, ...a: never[]) => unknown).apply(this, finishArgs);
          },
        );

        return encoder;
      },
    ),
  );

  return {
    available: true,
    restores,
    beginFrame(frame: number): void {
      currentFrame = frame;
    },
    async collect(): Promise<Map<number, { sumMs: number; spanMs: number; passes: number }>> {
      const perFrame = new Map<number, { sumMs: number; spanMs: number; passes: number }>();

      if (nextSlot === 0) {
        return perFrame;
      }

      // The copy runs on a plain encoder (created after `currentFrame` is reset
      // to -1, so it is not itself instrumented) and is awaited, so the map is
      // guaranteed to see every resolve submitted above it.
      currentFrame = -1;

      const encoder = device.createCommandEncoder({ label: 'timer-probe:readback-copy' });

      encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, nextSlot * RESOLVE_STRIDE_BYTES);
      device.queue.submit([encoder.finish()]);

      await readBuffer.mapAsync(GPUMapMode.READ, 0, nextSlot * RESOLVE_STRIDE_BYTES);

      // Copied out of the mapped range: `unmap` invalidates the view.
      const raw = BigUint64Array.from(new BigUint64Array(readBuffer.getMappedRange(0, nextSlot * RESOLVE_STRIDE_BYTES)));

      readBuffer.unmap();

      const perSlot = RESOLVE_STRIDE_BYTES / 8;

      for (let slot = 0; slot < nextSlot; slot++) {
        const frame = slotFrame[slot];

        if (frame === undefined) {
          continue;
        }

        const base = slot * perSlot;
        let sumNs = 0;
        let minBegin = Number.POSITIVE_INFINITY;
        let maxEnd = Number.NEGATIVE_INFINITY;
        let passes = 0;

        for (let pair = 0; pair + 1 < perSlot; pair += 2) {
          const begin = raw[base + pair]!;
          const end = raw[base + pair + 1]!;

          // An unwritten (or unresolvable) pair reads back as zero.
          if (begin === 0n || end === 0n || end <= begin) {
            continue;
          }

          const beginNs = Number(begin);
          const endNs = Number(end);

          sumNs += endNs - beginNs;
          minBegin = Math.min(minBegin, beginNs);
          maxEnd = Math.max(maxEnd, endNs);
          passes++;
        }

        if (passes === 0) {
          continue;
        }

        const entry = perFrame.get(frame) ?? { sumMs: 0, spanMs: 0, passes: 0 };

        entry.sumMs += sumNs / 1e6;
        entry.spanMs = Math.max(entry.spanMs, (maxEnd - minBegin) / 1e6);
        entry.passes += passes;
        perFrame.set(frame, entry);
      }

      return perFrame;
    },
    notes,
  };
};

/** Fresh canvas for the run, replacing whatever `#stage` currently is. */
const freshCanvas = (): HTMLCanvasElement => {
  document.getElementById('stage')?.remove();

  const canvas = document.createElement('canvas');

  canvas.id = 'stage';
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  document.body.appendChild(canvas);

  return canvas;
};

/**
 * One clear-only render pass, into the canvas swapchain (`context` non-null) or
 * into a probe-owned offscreen texture. The GPU work is identical either way;
 * only whether the target is PRESENTED differs — which is the entire content of
 * the `canvas-clear` / `offscreen-clear` A/B.
 */
const submitClear = (device: GPUDevice, context: GPUCanvasContext | null, offscreen: GPUTexture | null): void => {
  const view = context !== null ? context.getCurrentTexture().createView() : (offscreen?.createView() ?? null);

  if (view === null) {
    return;
  }

  const encoder = device.createCommandEncoder({ label: 'timer-probe:clear' });
  const pass = encoder.beginRenderPass({
    label: 'timer-probe:clear-pass',
    colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  });

  pass.end();
  device.queue.submit([encoder.finish()]);
};

/** One animation-frame tick. */
const nextFrame = async (): Promise<number> =>
  new Promise<number>(resolve => {
    requestAnimationFrame(resolve);
  });

/**
 * Scheduler and clock controls.
 *
 * These are the measurements that decide whether a small WebGPU `frameMs` sample
 * is GPU execution at all: if a queue that is provably idle still reports several
 * milliseconds to `onSubmittedWorkDone`, that number is completion-callback
 * latency and no amount of arithmetic over `doneAt` values turns it into GPU
 * time.
 */
const runControls = async (device: GPUDevice | null, samples: number, timestampsQuantized: boolean | null): Promise<TimerControlResult> => {
  // performance.now() resolution: sample the clock in a tight loop and keep the
  // distinct deltas. Chromium clamps to 100µs unless the page is cross-origin
  // isolated; a coarser clamp would put a floor under every timing in the bench.
  const deltas = new Map<number, number>();
  let minDelta = Number.POSITIVE_INFINITY;
  let previous = performance.now();

  for (let i = 0; i < 200_000; i++) {
    const now = performance.now();
    const delta = now - previous;

    if (delta > 0) {
      const key = Number(delta.toFixed(4));

      deltas.set(key, (deltas.get(key) ?? 0) + 1);
      minDelta = Math.min(minDelta, delta);
      previous = now;
    }
  }

  const microtaskMs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const startedAt = performance.now();

    await Promise.resolve();
    microtaskMs.push(performance.now() - startedAt);
  }

  const idleQueueMs: number[] = [];
  const emptySubmitMs: number[] = [];

  if (device !== null) {
    // Drain first, so the queue is provably empty for the first sample; each
    // sample's own await leaves it empty for the next.
    await device.queue.onSubmittedWorkDone();

    for (let i = 0; i < samples; i++) {
      const startedAt = performance.now();

      await device.queue.onSubmittedWorkDone();
      idleQueueMs.push(performance.now() - startedAt);
    }

    for (let i = 0; i < samples; i++) {
      const encoder = device.createCommandEncoder({ label: 'timer-probe:empty' });

      device.queue.submit([encoder.finish()]);

      const startedAt = performance.now();

      await device.queue.onSubmittedWorkDone();
      emptySubmitMs.push(performance.now() - startedAt);
    }
  }

  const rafIdleDeltaMs: number[] = [];
  let previousRaf: number | null = null;

  for (let i = 0; i < Math.min(samples, 30); i++) {
    const timestamp = await nextFrame();

    if (previousRaf !== null) {
      rafIdleDeltaMs.push(timestamp - previousRaf);
    }

    previousRaf = timestamp;
  }

  const adapterInfo: Record<string, string> = {};
  const info = (device as unknown as { adapterInfo?: GPUAdapterInfo } | null)?.adapterInfo;

  if (info !== undefined) {
    for (const key of ['vendor', 'architecture', 'device', 'description'] as const) {
      const value = (info as unknown as Record<string, unknown>)[key];

      if (typeof value === 'string' && value.length > 0) {
        adapterInfo[key] = value;
      }
    }
  }

  return {
    nowMinDeltaMs: Number.isFinite(minDelta) ? minDelta : 0,
    nowDeltaHistogram: [...deltas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    microtaskMs,
    idleQueueMs,
    emptySubmitMs,
    rafIdleDeltaMs,
    adapterInfo,
    features: device === null ? [] : [...device.features].filter(feature => feature.includes('timestamp')),
    timestampsQuantized,
  };
};

/**
 * Run one timer-methodology cell and return its full event timeline.
 *
 * Installed on `globalThis` so the Node driver invokes it through
 * `page.evaluate`, one cell per browser process.
 */
export const runTimerProbe = async (spec: TimerProbeSpec): Promise<TimerProbeResult> => {
  const archetype = ARCHETYPES.find(candidate => candidate.id === spec.archetype);

  if (archetype === undefined) {
    throw new Error(`Unknown archetype '${spec.archetype}'.`);
  }

  const notes: string[] = [];
  const restores: Restore[] = [];

  if (spec.timestampQueries && spec.backend === 'webgpu') {
    restores.push(patchRequestDeviceForTimestamps());
  }

  const canvas = freshCanvas();
  const adapter = createExoJsAdapter(undefined, spec.config);

  await adapter.init(canvas, spec.backend);

  const device = spec.backend === 'webgpu' ? (adapter.gpuDevice?.() ?? null) : null;

  if (spec.backend === 'webgpu' && device === null) {
    notes.push('no GPUDevice exposed; the queue-completion timeline is absent');
  }

  device?.addEventListener('uncapturederror', event => {
    notes.push(`uncaptured WebGPU error: ${(event as GPUUncapturedErrorEvent).error.message}`);
  });

  const counters = newFrameCounters();

  restores.push(
    patchMethod(DerivedSelectionState.prototype as unknown as Record<string, unknown>, 'update', original =>
      function update(this: DerivedSelectionState, ...args: never[]): unknown {
        const result = (original as (this: DerivedSelectionState, ...a: never[]) => unknown).apply(this, args);

        counters.selections++;
        counters.entered += this.enteredCount;

        return result;
      },
    ),
  );

  let epoch = 0;

  if (device !== null) {
    const queueRecord = (device as unknown as { queue: Record<string, unknown> }).queue;

    restores.push(
      patchMethod(queueRecord, 'writeBuffer', original =>
        function writeBuffer(this: unknown, ...args: never[]): unknown {
          counters.writeBufferBytes += writeBufferBytes(args as readonly unknown[]);

          return (original as (this: unknown, ...a: never[]) => unknown).apply(this, args);
        },
      ),
    );

    restores.push(
      patchMethod(queueRecord, 'submit', original =>
        function submit(this: unknown, ...args: never[]): unknown {
          const result = (original as (this: unknown, ...a: never[]) => unknown).apply(this, args);
          const at = performance.now() - epoch;

          counters.submits++;
          counters.firstSubmitAt ??= at;
          counters.lastSubmitAt = at;

          return result;
        },
      ),
    );
  }

  // Control-arm targets. `getContext('webgpu')` returns the context the engine
  // already configured on this canvas; it never creates a second one.
  const canvasContext = spec.mode === 'canvas-clear' ? (canvas.getContext('webgpu') as GPUCanvasContext | null) : null;
  const offscreen =
    spec.mode === 'offscreen-clear' && device !== null
      ? device.createTexture({
          label: 'timer-probe:offscreen',
          size: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
          format: navigator.gpu.getPreferredCanvasFormat(),
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        })
      : null;

  const rig = spec.timestampQueries && device !== null ? createTimestampRig(device) : null;

  if (rig !== null) {
    restores.push(...rig.restores);
    notes.push(...rig.notes);
  }

  const frames: TimerFrameRecord[] = [];
  const doneAt = new Map<number, number>();
  const pending: Array<Promise<void>> = [];

  try {
    adapter.buildScene(archetype, spec.nodeCount, SEED);

    let frameIndex = 0;
    const warmupStartedAt = performance.now();

    for (let i = 0; i < spec.warmupFrames; i++) {
      adapter.mutate(frameIndex++);
      adapter.renderFrame();
    }

    const warmupMs = performance.now() - warmupStartedAt;

    let warmupDrainMs = 0;

    if (spec.drainAfterWarmup && device !== null) {
      const drainStartedAt = performance.now();

      await device.queue.onSubmittedWorkDone();
      warmupDrainMs = performance.now() - drainStartedAt;
    }

    epoch = performance.now();

    let previousRaf: number | null = null;

    for (let i = 0; i < spec.timedFrames; i++) {
      const rafTimestamp = await nextFrame();
      const rafAtMs = rafTimestamp - epoch;
      const rafDeltaMs = previousRaf === null ? 0 : rafTimestamp - previousRaf;

      previousRaf = rafTimestamp;

      Object.assign(counters, newFrameCounters());
      rig?.beginFrame(i);

      const cpuBeginAt = performance.now();

      if (device !== null && spec.mode === 'idle-empty') {
        device.queue.submit([device.createCommandEncoder({ label: 'timer-probe:idle-empty' }).finish()]);
      } else if (device !== null && (spec.mode === 'canvas-clear' || spec.mode === 'offscreen-clear')) {
        submitClear(device, spec.mode === 'canvas-clear' ? canvasContext : null, offscreen);
      } else {
        adapter.mutate(frameIndex++);
        adapter.renderFrame();
      }

      const submittedAt = performance.now();
      const index = i;

      if (device !== null) {
        const promise = device.queue.onSubmittedWorkDone().then(() => {
          doneAt.set(index, performance.now() - epoch);
        });

        pending.push(promise);

        if (spec.mode === 'serialized') {
          // The reference arm: no second frame may be submitted while this one
          // is still outstanding, so every sample is provably isolated.
          await promise;
        }
      }

      frames.push({
        frame: i,
        rafAtMs,
        rafDeltaMs,
        cpuBeginAtMs: cpuBeginAt - epoch,
        cpuMs: submittedAt - cpuBeginAt,
        firstSubmitAtMs: counters.firstSubmitAt,
        lastSubmitAtMs: counters.lastSubmitAt,
        submits: counters.submits,
        submitAtMs: submittedAt - epoch,
        doneAtMs: null,
        gpuPassMs: null,
        gpuSpanMs: null,
        timedPasses: 0,
        selections: counters.selections,
        entered: counters.entered,
        writeBufferBytes: counters.writeBufferBytes,
      });
    }

    await Promise.all(pending);

    const gpuByFrame = rig === null ? new Map<number, { sumMs: number; spanMs: number; passes: number }>() : await rig.collect();

    for (const record of frames) {
      record.doneAtMs = doneAt.get(record.frame) ?? null;

      const gpu = gpuByFrame.get(record.frame);

      if (gpu !== undefined) {
        record.gpuPassMs = gpu.sumMs;
        record.gpuSpanMs = gpu.spanMs;
        record.timedPasses = gpu.passes;
      }
    }

    if (rig !== null) {
      notes.push(...rig.notes.filter(note => !notes.includes(note)));
    }

    const quantized =
      rig === null || !rig.available
        ? null
        : frames.filter(frame => frame.gpuPassMs !== null).every(frame => Number.isInteger(Math.round((frame.gpuPassMs ?? 0) * 1e4) / 1e3));

    const controls = spec.controls ? await runControls(device, spec.controlSamples, quantized) : null;

    return { spec, frames, warmupMs, warmupDrainMs, controls, notes };
  } finally {
    for (const restore of restores.splice(0, restores.length)) {
      restore();
    }

    adapter.teardown();
  }
};

declare global {
  var __runTimerProbe: ((spec: TimerProbeSpec) => Promise<TimerProbeResult>) | undefined;
}

globalThis.__runTimerProbe = runTimerProbe;
