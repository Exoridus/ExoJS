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
  document.getElementById('stage')?.remove();

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
 * {@link warmupFramesFor}); it scales up with node count (review B7).
 */
const FRAME_BUDGET_MS = 200;
/**
 * Number of trailing timed samples the abort check looks at (review B9).
 * Aborting on a SINGLE slow frame lets one GC pause or OS scheduling blip
 * mistake an otherwise-valid cell for a runaway one — the exact failure that
 * produced the `13.4x` WebGPU headline from an `n=1` aborted cell (review C2:
 * `results.md:98`, median==p95 because only one frame ever ran). Requiring the
 * MEDIAN of the last `ABORT_WINDOW` frames to exceed the budget means a lone
 * spike cannot trip the abort — only a sustained slowdown can — and guarantees
 * any cell that DOES abort reports a median over at least `ABORT_WINDOW`
 * samples, never a bogus single-frame "median".
 */
const ABORT_WINDOW = 3;

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
 * Note recorded on a WebGPU cell whose frame time comes from the queue's
 * submit-to-done wall clock rather than the rAF present cadence. This value is
 * de-vsynced GPU work, not a hardware timestamp — see {@link createWebGpuGpuTimer}.
 */
const WEBGPU_SUBMIT_TIMER_NOTE = 'frame time from queue.onSubmittedWorkDone (submit→done wall-clock; de-vsynced GPU work, not a hardware timestamp)';

/**
 * Per-frame GPU-time source. `available` is false for the inert fallback used
 * when no GPU timer exists; callers then fall back to the rAF-delta wall clock.
 */
interface GpuFrameTimer {
  /** Whether a real GPU timer is wired (vs. the inert fallback). */
  readonly available: boolean;
  /** Caveat to attach to the cell when THIS timer's samples are the reported frame time, or null when the source needs none. */
  readonly note: string | null;
  /** Open a GPU-time query bracketing the current frame's GPU commands. */
  beginFrame(): void;
  /** Close the current frame's GPU-time query. */
  endFrame(): void;
  /** Drain/await pending samples and return every elapsed-time sample (ms) gathered. */
  collect(): Promise<number[]>;
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
  beginFrame(): void {
    /* no GPU timer wired */
  },
  endFrame(): void {
    /* no GPU timer wired */
  },
  async collect(): Promise<number[]> {
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
    // A real hardware GPU-time query: canonical GPU frame time, no caveat needed.
    note: null,
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
    async collect(): Promise<number[]> {
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
 * WebGPU per-frame GPU timer that de-vsyncs the frame-time measurement.
 *
 * WebGPU exposes no externally-wireable hardware timestamp: `timestamp-query`
 * would need `timestampWrites` injected into the backend's own render-pass
 * descriptors, out of the harness's reach. The historical fallback — the delta
 * between consecutive `requestAnimationFrame` callbacks — measures the DISPLAY
 * PRESENT cadence, not GPU work: with a canvas swapchain the browser paces rAF to
 * the refresh interval, so every small cell pins to the vsync quantum (e.g. 6.9ms
 * at 144Hz) regardless of how little the GPU actually did. That column is
 * therefore vsync cadence dressed up as GPU time (review B1).
 *
 * Instead, each frame this timer records the wall-clock interval from just AFTER
 * the frame's command buffer was submitted (endFrame runs right after
 * `renderFrame`, which calls `queue.submit` synchronously) until the device
 * queue signals that submitted work is complete, via `queue.onSubmittedWorkDone`.
 * That promise resolves on QUEUE COMPLETION, independent of the swapchain present
 * that gates rAF, so the sample reflects the frame's actual GPU execution time
 * rather than the vsync interval. Because the harness paces frames from rAF, the
 * GPU has drained the previous frame before the next submit, so each frame's
 * submit→done delta is that frame's own work (not a cumulative queue backlog).
 *
 * Caveats, documented honestly on the cell via {@link WEBGPU_SUBMIT_TIMER_NOTE}:
 * this is a CPU-observed wall clock, not a hardware timestamp — it carries the
 * fixed latency of the completion callback and is subject to the same
 * `performance.now()` resolution clamp as the CPU timer (100µs until the page is
 * served cross-origin-isolated). It is nonetheless a true measure of per-frame
 * work rather than presentation cadence.
 */
const createWebGpuGpuTimer = (device: GPUDevice): GpuFrameTimer => {
  const pending: Array<Promise<void>> = [];
  const samplesMs: number[] = [];

  return {
    available: true,
    note: WEBGPU_SUBMIT_TIMER_NOTE,
    beginFrame(): void {
      // The measurement bracket opens at endFrame (post-submit); nothing to do
      // here. Kept for interface symmetry with the WebGL2 query timer.
    },
    endFrame(): void {
      // renderFrame has already recorded AND submitted this frame's work.
      const submittedAt = performance.now();

      pending.push(
        device.queue.onSubmittedWorkDone().then(() => {
          samplesMs.push(performance.now() - submittedAt);
        }),
      );
    },
    async collect(): Promise<number[]> {
      await Promise.all(pending);

      return samplesMs;
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
 * measure of GPU work that replaces the old vsync-bound rAF delta (review B1).
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
    // Every WebGL arm in this harness renders through a WebGL2 context — ExoJS,
    // Pixi and Excalibur create one, and the Phaser arm supplies one explicitly
    // via the `context` game-config option (see `adapters/phaser.ts`). So on the
    // `'webgl2'` backend `getContext('webgl2')` returns the engine's live context
    // and the structural probe attaches. A null here means the arm rendered
    // through no WebGL2 context at all, which is a real bug (or a silent WebGL1
    // fallback the adapter should have caught) — fail loudly rather than measure
    // a backend nobody asked for.
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
 * submit-to-done wall clock (de-vsynced GPU work; review B1). Only when no GPU
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

    // B3 — cross-arm mutation determinism. The comparison across arms is valid
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

    for (let frame = 0; frame < spec.warmupFrames; frame++) {
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

          frame++;

          // B9 — abort on a sustained slowdown, not a single spike (see
          // `shouldAbort`'s doc comment for the full rationale).
          if (shouldAbort(timer.samples, FRAME_BUDGET_MS, ABORT_WINDOW)) {
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

    // B4 — structural-probe self-check. The probe monkeypatches the live graphics
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

    const gpuSamplesMs = await gpuTimer.collect();
    const gpuUsable = gpuTimer.available && gpuSamplesMs.length > 0;
    const frameSamplesMs = gpuUsable ? gpuSamplesMs : rafDeltasMs;
    const frameMsMedian = frameSamplesMs.length > 0 ? median(frameSamplesMs) : null;
    const frameMsP95 = frameSamplesMs.length > 0 ? percentile(frameSamplesMs, 95) : null;

    const notes = [
      exceeded
        ? `the trailing ${ABORT_WINDOW}-frame median exceeded ${FRAME_BUDGET_MS}ms; cell aborted after ${measuredFrames} frame(s) — median/p95 below rest on ${measuredFrames} sample(s), not a single-frame artifact`
        : unevenNote,
      structuralNote,
      gpuUsable ? gpuTimer.note : NO_GPU_TIMER_NOTE,
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

    adapter = createPixiAdapter();
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

declare global {
  var __runBaselineCell: ((cell: CellSpec) => Promise<CellResult>) | undefined;
}

globalThis.__runBaselineCell = runBaselineCell;
