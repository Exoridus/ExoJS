import { createExoJsAdapter } from '../adapters/exojs';
import { ARCHETYPES } from '../archetypes';
import type { CellResult, CellSpec, EngineAdapter, StructuralCounters } from '../EngineAdapter';
import { attachWebGl2Probe } from '../metrics/structural';
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

/**
 * Measure a single matrix cell end-to-end: initialise the engine, attach the
 * structural probe to the live context, build the scene, warm up, then run the
 * cell's timed frames while sampling per-frame CPU time and draw-call structure.
 * GPU frame time is left `null` here — a later task fills it in.
 */
export const runCell = async (adapter: EngineAdapter, spec: CellSpec, canvas: HTMLCanvasElement): Promise<CellResult> => {
  const archetype = ARCHETYPES.find(candidate => candidate.id === spec.archetype);

  if (archetype === undefined) {
    throw new Error(`Unknown archetype '${spec.archetype}'.`);
  }

  await adapter.init(canvas, spec.backend);

  // The engine created the context via canvas.getContext('webgl2'); requesting
  // it again returns that same object, so the probe wraps the live context.
  const gl = canvas.getContext('webgl2');

  if (gl === null) {
    throw new Error('A WebGL2 context is required on the harness canvas.');
  }

  const probe = attachWebGl2Probe(gl);
  const timer = createCpuTimer();

  try {
    adapter.buildScene(archetype, spec.nodeCount, SEED);

    for (let frame = 0; frame < WARMUP_FRAMES; frame++) {
      adapter.mutate(frame);
      adapter.renderFrame();
    }

    probe.reset();

    let exceeded = false;

    for (let frame = 0; frame < spec.timedFrames; frame++) {
      timer.begin();
      adapter.mutate(frame);
      adapter.renderFrame();
      timer.end();

      if (timer.samples[timer.samples.length - 1]! > FRAME_BUDGET_MS) {
        exceeded = true;
        break;
      }
    }

    const measuredFrames = timer.samples.length;
    const { structural, note: unevenNote } = perFrameStructural(probe.counters, measuredFrames);
    const note = exceeded ? `a timed frame exceeded ${FRAME_BUDGET_MS}ms; cell aborted after ${measuredFrames} frame(s)` : unevenNote;

    return {
      spec,
      cpuMsMedian: median(timer.samples),
      cpuMsP95: percentile(timer.samples, 95),
      frameMsMedian: null,
      frameMsP95: null,
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
