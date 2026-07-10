import { createExoJsAdapter } from '../adapters/exojs';
import { ARCHETYPES } from '../archetypes';
import type { CellResult, CellSpec, EngineAdapter, StructuralCounters } from '../EngineAdapter';
import { attachWebGl2Probe, attachWebGpuProbe, type StructuralProbe } from '../metrics/structural';
import { createCpuTimer, median, percentile } from '../metrics/timing';

/** Fixed RNG seed shared by every cell so both benchmark arms select the same mutation set. */
const SEED = 0xc0ffee;
/** Discarded frames run before measuring, to warm shader compiles, texture uploads and JIT. */
const WARMUP_FRAMES = 10;
/** A single timed frame slower than this aborts the cell — a runaway node count, not a datapoint. */
const FRAME_BUDGET_MS = 200;

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
 * Per-frame GPU-time source. `available` is false for the inert fallback used
 * when no GPU timer exists; callers then fall back to the rAF-delta wall clock.
 */
interface GpuFrameTimer {
  /** Whether a real GPU timer is wired (vs. the inert fallback). */
  readonly available: boolean;
  /** Open a GPU-time query bracketing the current frame's GPU commands. */
  beginFrame(): void;
  /** Close the current frame's GPU-time query. */
  endFrame(): void;
  /** Drain resolved queries and return every elapsed-time sample (ms) gathered. */
  collect(): number[];
}

/** GPU timer used when no timer extension/feature is available: contributes nothing, never fabricates a number. */
const noopGpuTimer: GpuFrameTimer = {
  available: false,
  beginFrame(): void {
    /* no GPU timer wired */
  },
  endFrame(): void {
    /* no GPU timer wired */
  },
  collect(): number[] {
    return [];
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
    collect(): number[] {
      // Results are near-certainly resolved once every timed frame has run;
      // spin-drain with a hard cap so a stuck query can never hang the harness.
      for (let spins = 0; pending.length > 0 && spins < 10_000; spins++) {
        drain();
      }

      return samplesMs;
    },
  };
};

/**
 * Attach the structural probe (and, on WebGL2, a GPU timer) for a cell. The
 * WebGL2 context is recoverable from the canvas — `getContext('webgl2')` returns
 * the same object the engine created — but the WebGPU device is not, so it comes
 * from the adapter. WebGPU has no externally-wireable GPU timer: `timestamp-query`
 * needs `timestampWrites` injected into the backend's own render-pass
 * descriptors, out of the harness's reach, so its frame time is the rAF delta.
 */
const attachProbes = (adapter: EngineAdapter, spec: CellSpec, canvas: HTMLCanvasElement): { probe: StructuralProbe; gpuTimer: GpuFrameTimer } => {
  if (spec.backend === 'webgpu') {
    const device = adapter.gpuDevice?.() ?? null;

    if (device === null) {
      throw new Error('The webgpu backend did not expose a GPUDevice for probe attachment.');
    }

    return { probe: attachWebGpuProbe(device), gpuTimer: noopGpuTimer };
  }

  const gl = canvas.getContext('webgl2');

  if (gl === null) {
    throw new Error('A WebGL2 context is required on the harness canvas.');
  }

  return { probe: attachWebGl2Probe(gl), gpuTimer: createWebGl2GpuTimer(gl) };
};

/**
 * Measure a single matrix cell end-to-end: initialise the engine, attach the
 * structural probe (and a GPU timer where one exists), build the scene, warm up,
 * then run the cell's timed frames FROM `requestAnimationFrame` while sampling
 * per-frame CPU time, full-frame wall-clock and draw-call structure.
 *
 * Frame wall-clock is the delta between consecutive rAF callbacks. Where a GPU
 * timer resolved real samples they take precedence; otherwise the rAF delta is
 * reported with {@link NO_GPU_TIMER_NOTE} — a GPU number is never fabricated.
 * The CPU timer still brackets exactly `mutate` + `renderFrame` (the primary
 * metric); the GPU-query bracket sits outside it so the restructuring does not
 * change what CPU time measures.
 */
export const runCell = async (adapter: EngineAdapter, spec: CellSpec, canvas: HTMLCanvasElement): Promise<CellResult> => {
  const archetype = ARCHETYPES.find(candidate => candidate.id === spec.archetype);

  if (archetype === undefined) {
    throw new Error(`Unknown archetype '${spec.archetype}'.`);
  }

  await adapter.init(canvas, spec.backend);

  const { probe, gpuTimer } = attachProbes(adapter, spec, canvas);
  const timer = createCpuTimer();

  try {
    adapter.buildScene(archetype, spec.nodeCount, SEED);

    for (let frame = 0; frame < WARMUP_FRAMES; frame++) {
      adapter.mutate(frame);
      adapter.renderFrame();
    }

    probe.reset();

    const rafDeltasMs: number[] = [];
    let exceeded = false;

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

          const lastCpuMs = timer.samples[timer.samples.length - 1]!;

          frame++;

          if (lastCpuMs > FRAME_BUDGET_MS) {
            exceeded = true;
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
    const { structural, note: unevenNote } = perFrameStructural(probe.counters, measuredFrames);

    const gpuSamplesMs = gpuTimer.collect();
    const gpuUsable = gpuTimer.available && gpuSamplesMs.length > 0;
    const frameSamplesMs = gpuUsable ? gpuSamplesMs : rafDeltasMs;
    const frameMsMedian = frameSamplesMs.length > 0 ? median(frameSamplesMs) : null;
    const frameMsP95 = frameSamplesMs.length > 0 ? percentile(frameSamplesMs, 95) : null;

    const notes = [
      exceeded ? `a timed frame exceeded ${FRAME_BUDGET_MS}ms; cell aborted after ${measuredFrames} frame(s)` : unevenNote,
      gpuUsable ? null : NO_GPU_TIMER_NOTE,
    ].filter((value): value is string => value !== null);
    const note = notes.length > 0 ? notes.join('; ') : null;

    return {
      spec,
      cpuMsMedian: median(timer.samples),
      cpuMsP95: percentile(timer.samples, 95),
      frameMsMedian,
      frameMsP95,
      structural,
      status: exceeded ? 'exceeded' : 'ok',
      ...(note !== null && { note }),
    };
  } finally {
    probe.detach();
    adapter.teardown();
  }
};

/**
 * Run a whole matrix of cells against a single ExoJS adapter on the page's
 * canvas, in order, returning one {@link CellResult} per cell. Installed on
 * `globalThis` so the out-of-page driver can invoke it via `page.evaluate`.
 */
const runBaselineMatrix = async (cells: CellSpec[]): Promise<CellResult[]> => {
  const canvas = document.getElementById('stage');

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The harness canvas #stage was not found.');
  }

  const adapter = createExoJsAdapter();
  const results: CellResult[] = [];

  for (const cell of cells) {
    results.push(await runCell(adapter, cell, canvas));
  }

  return results;
};

declare global {
  var __runBaselineMatrix: ((cells: CellSpec[]) => Promise<CellResult[]>) | undefined;
}

globalThis.__runBaselineMatrix = runBaselineMatrix;
