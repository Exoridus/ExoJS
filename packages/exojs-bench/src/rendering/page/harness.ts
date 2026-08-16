// Side-effect import: installs `globalThis.__runTimerProbe` for the frame-timer
// methodology driver. It shares this page (and therefore the same Vite graph and
// engine module instances) but never runs during a matrix cell.
import './timerProbe';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import { createCpuTimer, median, percentile, shouldAbort } from '../../shared/timing';
import { createExoJsAdapter } from '../adapters/exojs';
import { ARCHETYPES } from '../archetypes';
import type { CellResult, CellSpec, EngineAdapter, StructuralCounters } from '../EngineAdapter';
import { attachWebGl2Probe, attachWebGpuProbe, type StructuralProbe } from '../structural';

/** Design-space viewport of the per-cell harness canvas (mirrors the adapters' VIEWPORT_*). */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

/**
 * Replace `#stage` with a pristine canvas for the cell about to run and return
 * it.
 *
 * Each cell gets its OWN canvas rather than reusing one shared element. Some
 * engines own their canvas/context lifecycle and do not reliably re-initialise
 * on a canvas whose context a previous cell created and then destroyed —
 * Pixi.js, for instance, HANGS on its second `Application.init` against a reused
 * canvas. A fresh element per cell fully isolates cells (and arms) from each
 * other: every `init` starts from a clean context, exactly as a standalone run
 * of that engine would. The old canvas is removed first so at most one live GPU
 * context exists at a time (staying well under the browser's context cap), and
 * the id stays `stage` so the driver's provenance read still finds it.
 */
const freshStageCanvas = (): HTMLCanvasElement => {
  const previous = document.getElementById('stage');

  // Removing the canvas element does NOT free its WebGL context — that waits on
  // GC, which is non-deterministic. Across the ~90-cell WebGL2 matrix the orphaned
  // contexts pile up past the browser's live-context cap (~16) and a later cell's
  // init/renderFrame wedges indefinitely (the observed cell-87 freeze: the excalibur
  // arm's `engine.dispose()` drops references but never loses the GL context, so
  // each excalibur cell leaked one). Force-lose the PREVIOUS cell's context here —
  // one cell after it ran, so the driver's post-first-ok-cell provenance read
  // (`readRendererInPage`) still finds a live context — which deterministically
  // frees that context's GPU resources regardless of what the arm's teardown did.
  // webgl2 and webgl1 (Phaser renders WebGL1) are both handled; a webgpu cell has
  // no webgl context here and is skipped.
  if (previous instanceof HTMLCanvasElement) {
    // `getContext('webgl2')` returns the existing context when one is present
    // (it never creates a second); falling back to `'webgl'` covers Phaser's
    // WebGL1 canvas. A webgpu (or context-less) canvas yields null on both and is
    // left untouched.
    const gl = previous.getContext('webgl2') ?? previous.getContext('webgl');

    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  previous?.remove();

  const canvas = document.createElement('canvas');

  canvas.id = 'stage';
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  document.body.appendChild(canvas);

  return canvas;
};

/** Fixed RNG seed shared by every cell so both benchmark arms select the same mutation set. */
const SEED = 0xc0ffee;
/**
 * A timed frame slower than this is a candidate abort — a runaway node count,
 * not a datapoint. Warmup-frame count is per-cell (see `spec.warmupFrames`,
 * {@link warmupFramesFor}); it scales up with node count.
 */
const FRAME_BUDGET_MS = 200;
/**
 * Number of trailing timed samples the abort check looks at.
 * Aborting on a SINGLE slow frame lets one GC pause or OS scheduling blip
 * mistake an otherwise-valid cell for a runaway one — the exact failure that
 * produced the `13.4x` WebGPU headline from an `n=1` aborted cell (
 * `results.md:98`, median==p95 because only one frame ever ran). Requiring the
 * MEDIAN of the last `ABORT_WINDOW` frames to exceed the budget means a lone
 * spike cannot trip the abort — only a sustained slowdown can — and guarantees
 * any cell that DOES abort reports a median over at least `ABORT_WINDOW`
 * samples, never a bogus single-frame "median".
 */
const ABORT_WINDOW = 3;
/**
 * Wall-clock cap on the synchronous warmup phase (ms). Warmup runs
 * `spec.warmupFrames` — scaled UP with node count — to settle
 * shader-compile / texture-upload / JIT before timing, but that frame COUNT
 * assumes cheap frames. A pathological cell (a weak arm under 25k full-viewport
 * overdraw renders multi-second frames) turned a 25-frame warmup into a 10+
 * minute stall with no bound: the timed loop has `shouldAbort`, warmup had
 * nothing. Cap warmup by TIME instead — an engine is fully warm within a few
 * frames, and once cumulative warmup passes this budget the cell is either
 * already deep into cheap frames (so it hit `warmupFrames` first and this never
 * bound) or rendering multi-second frames (so it will abort in the timed phase —
 * more warmup is wasted work). Set well above the worst TRUSTED warmup
 * (`warmupFrames` × `FRAME_BUDGET_MS` ≈ 8s at the abort edge), so a cell that
 * produces a trusted timing never has its warmup truncated; only catastrophic
 * cells are cut short — to a single frame, since one such frame alone blows the
 * budget.
 */
const WARMUP_BUDGET_MS = 10_000;
/**
 * Single-frame hard-abort threshold for the timed loop (10× `FRAME_BUDGET_MS`).
 * `shouldAbort`'s median-of-last-`ABORT_WINDOW` rule deliberately never aborts on
 * ONE slow frame (a lone GC/scheduler spike must not fake a runaway).
 * But a frame at 10× the budget is not a spike — no realistic blip turns a
 * sub-200ms cell into a 2s frame — it is a catastrophically slow cell that WILL
 * abort regardless. Aborting after the first such frame, rather than waiting for
 * three, cuts a weak arm's heaviest cells from minutes to seconds with the SAME
 * `exceeded` verdict; the median rule still governs every borderline case.
 */
const HARD_FRAME_BUDGET_MS = FRAME_BUDGET_MS * 10;

/**
 * Reduce accumulated structural totals to per-frame figures. Draw/bind/upload
 * counts are steady-state per frame, so an even division is expected; a
 * remainder means the harness has a bug (a fractional draw call is nonsense),
 * so the raw totals are surfaced instead and flagged via the returned note.
 */
const perFrameStructural = (totals: StructuralCounters, frames: number): { structural: StructuralCounters; note: string | null } => {
  const draws = totals.drawCalls / frames;
  const binds = totals.textureBinds / frames;
  const uploads = totals.bufferUploads / frames;
  const even = Number.isInteger(draws) && Number.isInteger(binds) && Number.isInteger(uploads);

  if (even) {
    return { structural: { drawCalls: draws, textureBinds: binds, bufferUploads: uploads }, note: null };
  }

  return {
    structural: { drawCalls: totals.drawCalls, textureBinds: totals.textureBinds, bufferUploads: totals.bufferUploads },
    note: `structural counters did not divide evenly over ${frames} frame(s); raw totals reported`,
  };
};

/** Note recorded on a cell whose full-frame time came from rAF cadence, not a GPU timer. */
const NO_GPU_TIMER_NOTE = 'frame time from rAF delta; no GPU timer';

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
const WEBGPU_TIMESTAMP_NOTE =
  'frame time from hardware timestamp-query around the frame\'s render passes (render-pass execution only — queue.writeBuffer upload copies are queue operations outside any pass and are NOT included; see queueMs* for a measure that does see them). Not comparable to the WebGL2 hardware query, which brackets the frame\'s whole GL command stream including uploads';

/**
 * Note recorded on a WebGPU cell that could not obtain `timestamp-query`, so it
 * has no hardware GPU clock at all. The queue-completion wall clock is
 * deliberately NOT promoted into the gap: it is floored by completion-observation
 * latency (measured at 0.5ms when the frame presents, 3.2ms when it does not,
 * against 0.002ms of actual GPU work), so it cannot stand in for frame time.
 */
const WEBGPU_NO_TIMESTAMP_NOTE =
  'WebGPU device exposes no timestamp-query feature, so this backend has no hardware GPU clock here; frame time falls back to the rAF present cadence and queueMs* is reported separately';

/**
 * Note recorded alongside every WebGPU cell's `queueMs*` pair, stating exactly
 * what that column is and — just as importantly — what its floor is.
 */
const WEBGPU_QUEUE_NOTE =
  'queueMs* = queue occupancy attributed to the frame that caused it (doneAt − max(submitAt, previous doneAt)), from queue.onSubmittedWorkDone. It is an UPPER BOUND on the frame\'s queue work and carries a completion-observation floor of ~0.5ms (presenting frame) to ~3.2ms (non-presenting), so any value below ~4ms is dominated by observation latency rather than GPU work; read it for large events, never as a small-frame GPU time';

/** Both series a GPU timer can produce for one cell. */
interface GpuFrameSamples {
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
interface GpuFrameTimer {
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

/**
 * Structural probe used when no graphics handle can be wrapped (a WebGPU arm
 * that exposes no `GPUDevice`). Counts nothing; the cell keeps its timing but
 * reports zeroed structural counters with a note, rather than crashing the run.
 */
const noopStructuralProbe: StructuralProbe = {
  counters: { drawCalls: 0, textureBinds: 0, bufferUploads: 0 },
  reset(): void {
    /* nothing wrapped */
  },
  detach(): void {
    /* nothing wrapped */
  },
};

/** GPU timer used when no timer extension/feature is available: contributes nothing, never fabricates a number. */
const noopGpuTimer: GpuFrameTimer = {
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
 * absent — then this returns {@link noopGpuTimer} and the caller uses the rAF
 * delta). One `TIME_ELAPSED` query may be outstanding at a time, so each frame
 * opens a query, closes it, and drains any results that have since resolved;
 * unresolved queries are collected at the end. Every GL call is guarded: any
 * failure disables the timer for the rest of the cell rather than throwing mid
 * frame, so a flaky extension never corrupts the primary CPU metric.
 */
const createWebGl2GpuTimer = (gl: WebGL2RenderingContext): GpuFrameTimer => {
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
 * A device's feature set is immutable, and every arm — ours and the competitors'
 * — builds its own device descriptor, so the feature cannot be added after the
 * fact. Patching the adapter prototype at module scope is the only place that
 * runs before any arm's `init`. The patch is ADDITIVE (an arm's own
 * `requiredFeatures` are preserved) and IDENTICAL for every arm, so it cannot
 * tilt a comparison; requesting an unused feature does not change rendering
 * behaviour.
 */
const requestTimestampFeature = (): void => {
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

requestTimestampFeature();

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
 * timed window — no per-frame readback, so the instrument adds no completion
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
    // The wrapper therefore always writes the member — the injected pair inside
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
        // GPU clock was interrupted. Neither is a measurement — drop it rather
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
 * 1. `frameMs` — hardware `timestamp-query` around the frame's render passes.
 *    Exact and reproducible (a 1k / 10k / 100k / 1M sweep measured
 *    0.004 / 0.007 / 0.045 / 0.412ms with p95 == median to the third decimal),
 *    but it covers pass EXECUTION only: `queue.writeBuffer` is a queue operation
 *    outside every command buffer, so its device copy cannot be bracketed.
 * 2. `queueMs` — `queue.onSubmittedWorkDone` wall clock, with each frame charged
 *    only the interval after the PREVIOUS frame's observed completion
 *    (`doneAt − max(submitAt, previousDoneAt)`). This is the only signal that
 *    sees upload cost, and the only one that can surface a stall.
 *
 * Why `queueMs` is not the frame time, despite being the historical column: it is
 * floored by when the browser OBSERVES the completion, not by when the GPU
 * finished. Two control arms pin that down — a rAF-paced submit that clears the
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
 * is a LOWER bound on its own work — strictly better than counting the big frame
 * again, and disclosed as such in {@link WEBGPU_QUEUE_NOTE}.
 */
const createWebGpuGpuTimer = (device: GPUDevice): GpuFrameTimer => {
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
      // `queueMs` series can — the first timed frame's cumulative
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

/**
 * Attach the structural probe and a per-frame GPU timer for a cell. The WebGL2
 * context is recoverable from the canvas — `getContext('webgl2')` returns the
 * same object the engine created — but the WebGPU device is not, so it comes from
 * the adapter. WebGL2 uses a hardware `EXT_disjoint_timer_query_webgl2` timer when
 * present; WebGPU has no externally-wireable hardware timestamp, so it uses the
 * submit-to-done wall clock (see {@link createWebGpuGpuTimer}) — a de-vsynced
 * measure of GPU work that replaces the old vsync-bound rAF delta.
 */
const attachProbes = (adapter: EngineAdapter, spec: CellSpec, canvas: HTMLCanvasElement): { probe: StructuralProbe; gpuTimer: GpuFrameTimer; structuralNote: string | null } => {
  if (spec.backend === 'webgpu') {
    const device = adapter.gpuDevice?.() ?? null;

    // A WebGPU arm should expose its GPUDevice via `gpuDevice()` so the
    // structural probe (and the submit→done GPU timer) can attach. When it does
    // not — some third-party renderers do not surface the device — DEGRADE
    // GRACEFULLY rather than aborting the whole run (the failure mode that lost
    // every completed cell): keep the CPU timing and the rAF-delta frame time,
    // but skip the structural counters and the zero-draw self-check for this
    // cell, recording why in the note. Our own arms and the Pixi arm DO expose
    // the device, so this path is a safety net, not the norm.
    if (device === null) {
      return {
        probe: noopStructuralProbe,
        gpuTimer: noopGpuTimer,
        structuralNote: `structural counters skipped: engine='${spec.engine}' config='${spec.config}' exposed no GPUDevice on webgpu (timing kept)`,
      };
    }

    return { probe: attachWebGpuProbe(device), gpuTimer: createWebGpuGpuTimer(device), structuralNote: null };
  }

  const gl = canvas.getContext('webgl2');

  if (gl === null) {
    // The arm rendered through a plain WebGL context on this canvas, not a WebGL2
    // one. The Phaser arm is measured as a stock Phaser 4 app: Phaser 4's
    // WebGLRenderer creates a `'webgl'` (WebGL1) context by default
    // (`canvas.getContext('webgl')`, WebGLRenderer.js:709), and once a `'webgl'`
    // context owns the element `getContext('webgl2')` returns null. Degrade
    // gracefully — the same policy as the WebGPU no-device path: keep the CPU
    // timing and the rAF frame delta, skip the WebGL2 structural probe (and its
    // zero-draw self-check, which the non-null `structuralNote` suppresses), and
    // DISCLOSE why in the cell note. Never fabricate counters, never throw away
    // the whole run over an arm's WebGL version. Init has already succeeded by
    // here, so a live context exists; only a canvas with no graphics context at
    // all is a real bug worth failing.
    const gl1 = canvas.getContext('webgl');

    if (gl1 !== null) {
      return {
        probe: noopStructuralProbe,
        gpuTimer: noopGpuTimer,
        structuralNote: `structural counters skipped: engine='${spec.engine}' config='${spec.config}' rendered through a WebGL context (Phaser 4 renders WebGL1 via getContext('webgl'), WebGLRenderer.js:709), so the WebGL2 draw-call probe cannot attach — draw/bind/upload structure is omitted for this arm (CPU + rAF frame timing kept)`,
      };
    }

    throw new Error('A WebGL2 context is required on the harness canvas.');
  }

  return { probe: attachWebGl2Probe(gl), gpuTimer: createWebGl2GpuTimer(gl), structuralNote: null };
};

/**
 * Measure a single matrix cell end-to-end: initialise the engine, attach the
 * structural probe (and a GPU timer where one exists), build the scene, warm up,
 * then run the cell's timed frames FROM `requestAnimationFrame` while sampling
 * per-frame CPU time, full-frame wall-clock and draw-call structure.
 *
 * Frame time prefers a real GPU timer: the WebGL2 hardware query, or the WebGPU
 * submit-to-done wall clock (de-vsynced GPU work). Only when no GPU
 * timer resolved samples does it fall back to the rAF delta, reported with
 * {@link NO_GPU_TIMER_NOTE} — a GPU number is never fabricated. The CPU timer
 * still brackets exactly `mutate` + `renderFrame` (the primary metric); the GPU
 * bracket sits outside it so the restructuring does not change what CPU time
 * measures.
 */
export const runCell = async (adapter: EngineAdapter, spec: CellSpec, canvas: HTMLCanvasElement): Promise<CellResult> => {
  const archetype = ARCHETYPES.find(candidate => candidate.id === spec.archetype);

  if (archetype === undefined) {
    throw new Error(`Unknown archetype '${spec.archetype}'.`);
  }

  await adapter.init(canvas, spec.backend);

  const { probe, gpuTimer, structuralNote } = attachProbes(adapter, spec, canvas);
  const timer = createCpuTimer();

  try {
    adapter.buildScene(archetype, spec.nodeCount, SEED);

    // Cross-arm mutation determinism. The comparison across arms is valid
    // only if every arm wobbles the IDENTICAL leaf set for a given (archetype,
    // nodeCount, seed). Rather than compare arms pairwise (fragile), assert each
    // arm against the CANONICAL selection derived from the neutral archetype spec
    // — which transitively guarantees all arms agree. An arm that draws its RNG
    // differently (the exact failure the fairness contract warns about) fails
    // loudly HERE instead of silently producing an incomparable result. Arms that
    // do not report a signature (optional method) are skipped with a warning.
    const expectedSignature = mutationSignature(selectMutationIndices(spec.nodeCount, archetype.mutationFraction, SEED));
    const actualSignature = adapter.mutationSignature?.();

    if (actualSignature === undefined) {
      console.warn(
        `[baseline] arm engine='${spec.engine}' config='${spec.config}' reports no mutation signature; cross-arm determinism is UNVERIFIED for this arm (see EngineAdapter.mutationSignature).`,
      );
    } else if (actualSignature !== expectedSignature) {
      throw new Error(
        `Cross-arm mutation determinism violated: engine='${spec.engine}' config='${spec.config}' selected a different wobble set than the canonical seed=0x${SEED.toString(16)} selection for archetype='${spec.archetype}' n=${spec.nodeCount} (expected ${expectedSignature}, got ${actualSignature}). Arms are not comparable.`,
      );
    }

    // Warmup is bounded by BOTH frame count and wall-clock (see WARMUP_BUDGET_MS):
    // a pathologically slow cell stops warming after its first frame instead of
    // grinding through every warmupFrame, while a normal cell hits its full frame
    // budget long before the deadline.
    const warmupDeadline = performance.now() + WARMUP_BUDGET_MS;

    for (let frame = 0; frame < spec.warmupFrames; frame++) {
      adapter.mutate(frame);
      adapter.renderFrame();

      if (performance.now() >= warmupDeadline) {
        break;
      }
    }

    // ── measurement boundary ────────────────────────────────────────────────
    // Warmup runs unpaced, so on a backend whose frame time is a queue-completion
    // wall clock (WebGPU, see `createWebGpuGpuTimer`) it can still have work in
    // flight here — and that work would resolve INSIDE the first timed frames'
    // brackets, which is how a 1M-node cell reported 133ms on a frame that did
    // 0.9ms of work. Wait it out once, before the timed window opens. This runs
    // outside every reported metric: `cpuMs*` brackets only `mutate` +
    // `renderFrame`, the rAF deltas start at the first timed callback, and no GPU
    // sample exists yet. Backends whose timer cannot inherit a backlog (the
    // WebGL2 hardware query, the rAF-delta fallback) no-op here.
    await gpuTimer.drainSubmittedWork();

    probe.reset();

    const rafDeltasMs: number[] = [];
    let exceeded = false;
    // Set to the human-readable reason the moment the cell aborts, so the two
    // abort paths (single-frame hard cap vs. sustained-median) each explain
    // themselves precisely instead of the note being reconstructed after the fact.
    let abortNote: string | null = null;

    await new Promise<void>((resolve, reject) => {
      let frame = 0;
      let previousTimestamp: number | null = null;

      const step = (timestamp: number): void => {
        try {
          // Full-frame wall-clock: the interval between consecutive rAF
          // callbacks. The first callback has no predecessor, so it only seeds
          // the reference timestamp.
          if (previousTimestamp !== null) {
            rafDeltasMs.push(timestamp - previousTimestamp);
          }

          previousTimestamp = timestamp;

          // GPU query opens OUTSIDE the CPU bracket: `cpuTimer` must bracket
          // exactly `mutate` + `renderFrame`. `mutate` issues no GPU work, so
          // opening the query before it does not pollute the GPU sample.
          gpuTimer.beginFrame();
          timer.begin();
          adapter.mutate(frame);
          adapter.renderFrame();
          timer.end();
          gpuTimer.endFrame();

          frame++;

          const lastMs = timer.samples[timer.samples.length - 1]!;

          // Hard single-frame abort: a frame at 10x budget is catastrophic, not a
          // spike, so abort now rather than waiting for the ABORT_WINDOW median
          // (see HARD_FRAME_BUDGET_MS). Keeps a weak arm's heaviest cells to a
          // single timed frame.
          if (lastMs > HARD_FRAME_BUDGET_MS) {
            exceeded = true;
            abortNote = `a single timed frame took ${lastMs.toFixed(1)}ms (> ${HARD_FRAME_BUDGET_MS}ms hard cap, ${HARD_FRAME_BUDGET_MS / FRAME_BUDGET_MS}x the ${FRAME_BUDGET_MS}ms budget); cell aborted after ${frame} frame(s) — median/p95 below rest on ${frame} sample(s)`;
            resolve();
            return;
          }

          // Abort on a sustained slowdown, not a single spike (see
          // `shouldAbort`'s doc comment for the full rationale).
          if (shouldAbort(timer.samples, FRAME_BUDGET_MS, ABORT_WINDOW)) {
            exceeded = true;
            abortNote = `the trailing ${ABORT_WINDOW}-frame median exceeded ${FRAME_BUDGET_MS}ms; cell aborted after ${frame} frame(s) — median/p95 below rest on ${frame} sample(s), not a single-frame artifact`;
            resolve();
            return;
          }

          if (frame >= spec.timedFrames) {
            resolve();
            return;
          }

          requestAnimationFrame(step);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      requestAnimationFrame(step);
    });

    const measuredFrames = timer.samples.length;

    // Structural-probe self-check. The probe monkeypatches the live graphics
    // context AFTER engine init (the device/context does not exist earlier), so an
    // engine that cached its draw/bind method references at init would bypass the
    // wrappers and silently report zero — an undercount masquerading as truth.
    // Every archetype places drawable, on-screen sprites, so a non-empty cell MUST
    // issue at least one draw; a zero here means the probe was bypassed, not that
    // the scene drew nothing. Fail loudly rather than report the undercount.
    // (Pre-wrapping the WebGL2 context BEFORE init was rejected: creating the
    // context early would freeze the attributes the engine sets on its first
    // getContext — e.g. antialias — changing what is measured.)
    if (structuralNote === null && spec.nodeCount > 0 && probe.counters.drawCalls === 0) {
      throw new Error(
        `Structural probe recorded 0 draw calls for a non-empty ${spec.backend} scene (engine='${spec.engine}' config='${spec.config}' archetype='${spec.archetype}' n=${spec.nodeCount}); the probe wrappers were bypassed — counts are untrustworthy.`,
      );
    }

    const { structural, note: unevenNote } = perFrameStructural(probe.counters, measuredFrames);

    const gpuSamples = await gpuTimer.collect();
    const gpuUsable = gpuTimer.available && gpuSamples.frameMs.length > 0;
    const frameSamplesMs = gpuUsable ? gpuSamples.frameMs : rafDeltasMs;
    const frameMsMedian = frameSamplesMs.length > 0 ? median(frameSamplesMs) : null;
    const frameMsP95 = frameSamplesMs.length > 0 ? percentile(frameSamplesMs, 95) : null;
    // Second, backend-specific series: WebGPU's queue-occupancy upper bound. It
    // is reported BESIDE the frame time, never as it — the two measure different
    // things and only one of them (this one) can see `queue.writeBuffer` cost.
    const queueSamplesMs = gpuSamples.queueMs;
    const queueMsMedian = queueSamplesMs.length > 0 ? median(queueSamplesMs) : null;
    const queueMsP95 = queueSamplesMs.length > 0 ? percentile(queueSamplesMs, 95) : null;

    const notes = [
      exceeded ? abortNote : unevenNote,
      structuralNote,
      gpuUsable ? gpuTimer.note : NO_GPU_TIMER_NOTE,
      // A non-empty queue series means a live WebGPU device WAS wrapped, so an
      // unusable frame time here is specifically the missing hardware clock —
      // distinct from the no-device path, which reports its own reason.
      !gpuUsable && queueSamplesMs.length > 0 ? WEBGPU_NO_TIMESTAMP_NOTE : null,
      queueSamplesMs.length > 0 ? WEBGPU_QUEUE_NOTE : null,
    ].filter((value): value is string => value !== null);
    const note = notes.length > 0 ? notes.join('; ') : null;

    return {
      spec,
      cpuMsMedian: median(timer.samples),
      cpuMsP95: percentile(timer.samples, 95),
      frameMsMedian,
      frameMsP95,
      queueMsMedian,
      queueMsP95,
      structural,
      status: exceeded ? 'exceeded' : 'ok',
      ...(note !== null && { note }),
    };
  } finally {
    probe.detach();
    adapter.teardown();
  }
};

/** Registry key uniquely identifying an engine arm by its engine + config labels. */
const adapterKey = (engine: string, config: string): string => `${engine} ${config}`;

/**
 * Lazily construct the engine arm for one `(engine, config)` pair, caching each
 * instance so repeated `__runBaselineCell` calls reuse it across the backend's
 * cells (the adapter is stateless between cells — every cell's `runCell` fully
 * `init`s and `teardown`s it).
 *
 * Each competitor arm (Pixi, Phaser, Excalibur) is imported dynamically ON FIRST
 * USE so an ExoJS-only run never pays to load a competitor into the page, and a
 * competitor that is not linked fails only its own cells (the import rejects, the
 * driver records that cell `unavailable` and continues) rather than the whole
 * run. Each is a committed, official arm (pinned exact devDependency), imported
 * by a static specifier rather than the old gitignored `reference.local.ts`
 * runtime-glob discovery, which is retired.
 */
const adapterCache = new Map<string, EngineAdapter>();

const resolveAdapter = async (engine: string, config: string): Promise<EngineAdapter> => {
  const key = adapterKey(engine, config);
  const cached = adapterCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  let adapter: EngineAdapter;

  if (engine === 'exojs') {
    adapter = createExoJsAdapter(undefined, config === 'retained' ? 'retained' : 'current');
  } else if (engine === 'pixi') {
    const { createPixiAdapter } = await import('../adapters/pixi');

    adapter = createPixiAdapter(config === 'culled' ? 'culled' : 'default');
  } else if (engine === 'phaser') {
    const { createPhaserAdapter } = await import('../adapters/phaser');

    adapter = createPhaserAdapter();
  } else if (engine === 'excalibur') {
    const { createExcaliburAdapter } = await import('../adapters/excalibur');

    adapter = createExcaliburAdapter();
  } else {
    throw new Error(`No adapter registered for engine='${engine}' config='${config}'.`);
  }

  adapterCache.set(key, adapter);

  return adapter;
};

/**
 * Measure ONE matrix cell on the page's canvas and return its result. Installed
 * on `globalThis` so the out-of-page driver invokes it via `page.evaluate`, once
 * per cell.
 *
 * Driving one cell per call (rather than a whole backend's list in a single
 * evaluate) is the crash-isolation half of the incremental-checkpoint hardening:
 * the Node driver persists each returned result immediately and, if a cell
 * throws, records only that cell as unavailable instead of losing the backend's
 * completed cells. All calls share this one page, so the same-session timing
 * discipline is preserved across the backend's cells.
 */
const runBaselineCell = async (cell: CellSpec): Promise<CellResult> => {
  const canvas = freshStageCanvas();
  const adapter = await resolveAdapter(cell.engine, cell.config);

  return runCell(adapter, cell, canvas);
};

/**
 * Split-phase entry points used ONLY by the CPU-profiling mode
 * (`driver.ts::profileCell`). `runCell` is unusable for profiling because a
 * single `page.evaluate` covers engine init, scene construction, warmup, the
 * timed frames AND teardown — a profile taken across it is dominated by
 * one-shot setup cost and says nothing about the per-frame path. Splitting the
 * cell into `setup` / `frames` / `dispose` lets the Node driver start the CDP
 * sampler between setup and frames, so the captured profile contains the frame
 * loop and nothing else.
 *
 * Frames run SYNCHRONOUSLY here (a straight loop, no `requestAnimationFrame`)
 * on purpose: rAF pacing would inject idle time between frames and dilute the
 * sample density over exactly the code under study. This makes the phase
 * unsuitable for wall-clock reporting — it is never used for one — but ideal
 * for attributing self time.
 */
const profileState: { adapter: EngineAdapter | null; frame: number } = { adapter: null, frame: 0 };

const profileSetup = async (cell: CellSpec, warmupFrames: number): Promise<void> => {
  const archetype = ARCHETYPES.find(candidate => candidate.id === cell.archetype);

  if (archetype === undefined) {
    throw new Error(`Unknown archetype '${cell.archetype}'.`);
  }

  const canvas = freshStageCanvas();
  const adapter = await resolveAdapter(cell.engine, cell.config);

  await adapter.init(canvas, cell.backend);
  adapter.buildScene(archetype, cell.nodeCount, SEED);

  for (let frame = 0; frame < warmupFrames; frame++) {
    adapter.mutate(frame);
    adapter.renderFrame();
  }

  profileState.adapter = adapter;
  profileState.frame = warmupFrames;
};

const profileFrames = (count: number): number => {
  const adapter = profileState.adapter;

  if (adapter === null) {
    throw new Error('__profileFrames was called before __profileSetup.');
  }

  const startedAt = performance.now();

  for (let i = 0; i < count; i++) {
    adapter.mutate(profileState.frame++);
    adapter.renderFrame();
  }

  return performance.now() - startedAt;
};

const profileDispose = (): void => {
  profileState.adapter?.teardown();
  profileState.adapter = null;
};

declare global {
  var __runBaselineCell: ((cell: CellSpec) => Promise<CellResult>) | undefined;
  var __profileSetup: ((cell: CellSpec, warmupFrames: number) => Promise<void>) | undefined;
  var __profileFrames: ((count: number) => number) | undefined;
  var __profileDispose: (() => void) | undefined;
}

globalThis.__runBaselineCell = runBaselineCell;
globalThis.__profileSetup = profileSetup;
globalThis.__profileFrames = profileFrames;
globalThis.__profileDispose = profileDispose;
