/**
 * Allocation bench launcher — samples the per-frame plan allocation of the
 * budgeted gate archetypes plus the families the gate leaves out (nine-slice,
 * repeating, tilemap), and writes the numbers to `.workspace/output/render-perf/`.
 *
 *   pnpm perf:renderers:alloc                 # gate archetypes + extra families
 *   pnpm perf:renderers:alloc --reference     # …plus the 1M scrolling-world stage
 *
 * SOURCE-ACCURATE. The `perf:renderers:alloc` script passes
 * `--conditions=@codexo/source` (so the `#*` imports resolve to `src`, NOT to a
 * `dist` build) and `--import ./scripts/glsl-register.mjs` — a node ESM loader
 * hook that loads `.vert`/`.frag` as source text (the node/tsx counterpart of the
 * vitest `realShaderPlugin`) and installs the `__DEV__`/`__VERSION__`/
 * `__REVISION__` build-constant globals. Those two pieces plus the DOM shims in
 * `fakeDom.ts` are what a plain `node --import tsx/esm` run lacks: it would
 * resolve to `dist`, choke on the raw GLSL imports, throw `__DEV__ is not
 * defined`, and finally die on `document is not defined` while constructing the
 * placeholder textures the core renderers hold. Always run via the script.
 *
 * This launcher reports ONE sampling window per catalog scene. The CI gate
 * (`allocation.test.ts`) measures the same archetypes as a MEDIAN over five
 * fresh windows and is the number to trust for a budget; use this for breadth
 * and for the reference stage.
 *
 * The `--reference` stage is the exception: it reports a one-time BOOTSTRAP
 * TOTAL and a steady-state RATE as two separate numbers, because at a million
 * sprites those differ by three orders of magnitude and a single window that
 * straddles them is neither (see the block comment above `runReference`).
 *
 * @internal Test/perf-only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ColdStartAllocation, FrameAllocation } from './allocation';
import { measureColdStartAllocation, measureFrameAllocation } from './allocation';
import type { AllocationScene } from './allocationScenes';
import { ALLOCATION_ARCHETYPES, ALLOCATION_REPORT_ONLY, buildScrollingWorldReference } from './allocationScenes';
import { buildNineSliceScene, buildRepeatingScene, makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';
import { buildTilemapScene, makeTilesets, wireTilemapRenderers } from './tilemapFixtures';

const VIEW = { w: 1280, h: 720 };

interface Sample {
  readonly id: string;
  readonly warmup?: number | undefined;
  build(harness: WebGl2Harness): AllocationScene;
}

const toSample = (archetype: { id: string; warmup?: number; build(harness: WebGl2Harness): AllocationScene }): Sample => ({
  id: archetype.id,
  warmup: archetype.warmup,
  build: (harness: WebGl2Harness) => archetype.build(harness),
});

/**
 * The budgeted gate archetypes plus the report-only ones, so the launcher and
 * the gate never drift apart and the ungated coverage still gets measured.
 */
const catalogSamples: readonly Sample[] = [...ALLOCATION_ARCHETYPES, ...ALLOCATION_REPORT_ONLY].map(toSample);

/**
 * Families the gate deliberately leaves out — they allocate little and would
 * only add CI time — but which are still worth a periodic look here.
 */
const extraSamples: readonly Sample[] = [
  {
    id: 'nine-slice/100/1tex/stretch',
    build: () => {
      const { root } = buildNineSliceScene({
        count: 100,
        textures: makeTextures(1),
        slice: 16,
        width: 96,
        height: 96,
        fill: 'stretch',
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'nine-slice/100/8tex/stretch',
    build: () => {
      const { root } = buildNineSliceScene({
        count: 100,
        textures: makeTextures(8),
        assign: 'cycle',
        slice: 16,
        width: 96,
        height: 96,
        fill: 'stretch',
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'repeating/geometry/100/1tex',
    build: () => {
      const { root } = buildRepeatingScene({
        count: 100,
        textures: makeTextures(1),
        path: 'geometry',
        width: 128,
        height: 128,
        modeX: 'repeat',
        modeY: 'repeat',
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'repeating/shader/100/1tex',
    build: () => {
      const { root } = buildRepeatingScene({
        count: 100,
        textures: makeTextures(1),
        path: 'shader',
        width: 128,
        height: 128,
        modeX: 'repeat',
        modeY: 'repeat',
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  // Tilemap — measurable source-accurate because the GLSL loader handles the
  // chunk shaders. static = chunk geometry fully cached; pan = camera moves but
  // geometry is reused (revision unchanged).
  {
    id: 'tilemap/80x64/static',
    build: harness => {
      wireTilemapRenderers(harness.backend);

      const scene = buildTilemapScene({ widthTiles: 80, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

      return { root: scene.node, teardown: () => scene.node.destroy() };
    },
  },
  {
    id: 'tilemap/80x64/pan',
    build: harness => {
      wireTilemapRenderers(harness.backend);

      const scene = buildTilemapScene({ widthTiles: 80, heightTiles: 64, chunkSize: 32, tilesets: makeTilesets(1) });
      harness.view.reset(scene.pixelWidth / 2, scene.pixelHeight / 2, scene.pixelWidth, scene.pixelHeight);

      let frame = 0;
      const beforeFrame = (): void => {
        frame++;
        harness.view.setCenter(scene.pixelWidth / 2 + (frame % 8) * 16, scene.pixelHeight / 2);
      };

      return { root: scene.node, beforeFrame, teardown: () => scene.node.destroy() };
    },
  },
];

/**
 * The million-sprite scrolling world. Kept out of the gate (and off by default
 * here) because one reading at this size costs more than the entire rest of the
 * catalog — it is a reference reading for a human, not a budget.
 *
 * ── Why this stage is measured in TWO phases ───────────────────────────────
 * Everything else in this file is a steady-state rate: build the scene, warm a
 * few dozen frames, sample. At a million sprites that recipe silently reports
 * something else. The scene's start-up work scales with the node count and does
 * not fit in a short warm-up: frame 1 alone allocates ~466 MB (plan build,
 * per-drawable material keys, retained fragment snapshots), and the persistent
 * source + spatial visibility index are still being BUILT around frame 20 — the
 * frame's draw-call count collapses from 75 to 1 mid-window as that path takes
 * over. A 20-frame window opened after 5 warm-up frames therefore contains
 * nothing but bootstrap, and dividing it by 20 produced ~9 MB/"frame" — a number
 * that describes no frame this scene will ever render again, and ~600x this
 * scene's actual steady-state rate.
 *
 * So the stage reports the two quantities separately and never blends them:
 * a one-time bootstrap TOTAL, and a steady-state RATE taken well past it.
 *
 * ── Why the steady phase is a median over several windows ──────────────────
 * The same process-level bimodality already documented on `scrolling-world/10000`
 * (see `ALLOCATION_REPORT_ONLY`) reaches this scene too, and harder: measured in
 * a fresh process with no prior sampling window, this scene reads ~1.9 MB/frame
 * even at a 500-frame warm-up, all of it attributed to `SourceVisibilityIndex.query`
 * — a function that contains no allocation at all. Running any earlier sampling
 * window in the same process removes it entirely and the scene reads ~15 KB/frame
 * (verified: identical config, identical camera position and submitted-node count,
 * 1883 vs 15.6 KB/frame, flipped solely by having profiled earlier). It is a V8
 * optimisation-state artefact of the measurement, not a property of the frame.
 * The bootstrap phase always runs first here, so the steady phase is always
 * measured from the settled state; the median over several windows is what keeps
 * one stray window from moving the reported number.
 */
const REFERENCE_COUNT = 1_000_000;
/** Frames the bootstrap total covers — long enough to contain the source/index build. */
const REFERENCE_COLD_FRAMES = 100;
/** Frames rendered after the bootstrap window before the steady-state windows open. */
const REFERENCE_STEADY_WARMUP = 600;
/** Steady-state windows the reported median is taken over. */
const REFERENCE_STEADY_WINDOWS = 3;
const REFERENCE_STEADY_FRAMES = 100;

interface ReferenceReading {
  readonly id: string;
  readonly nodes: number;
  readonly cold: ColdStartAllocation;
  readonly steady: {
    readonly warmup: number;
    readonly frames: number;
    readonly medianBytesPerFrame: number;
    readonly windowsBytesPerFrame: readonly number[];
  };
  readonly seconds: number;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const runReference = async (): Promise<ReferenceReading> => {
  const started = performance.now();
  const harness = createWebGl2Harness();
  const scene = buildScrollingWorldReference(harness, REFERENCE_COUNT);

  const cold = await measureColdStartAllocation(harness, scene.root, {
    beforeFrame: scene.beforeFrame,
    frames: REFERENCE_COLD_FRAMES,
  });

  const windows: number[] = [];

  for (let i = 0; i < REFERENCE_STEADY_WINDOWS; i++) {
    // Only the first window pays the warm-up; the later ones continue from where
    // the previous one stopped, which is already past it.
    const alloc = await measureFrameAllocation(harness, scene.root, {
      beforeFrame: scene.beforeFrame,
      warmup: i === 0 ? REFERENCE_STEADY_WARMUP : 0,
      frames: REFERENCE_STEADY_FRAMES,
    });

    windows.push(alloc.bytesPerFrame);
  }

  scene.teardown?.();
  harness.destroy();

  return {
    id: `scrolling-world/${REFERENCE_COUNT}`,
    nodes: REFERENCE_COUNT,
    cold,
    steady: {
      warmup: REFERENCE_STEADY_WARMUP,
      frames: REFERENCE_STEADY_FRAMES,
      medianBytesPerFrame: median(windows),
      windowsBytesPerFrame: windows,
    },
    seconds: (performance.now() - started) / 1000,
  };
};

const includeReference = process.argv.includes('--reference');

if (!includeReference) {
  console.log('(pass --reference to also run the 1M scrolling-world stage)\n');
}

const results: Array<FrameAllocation & { id: string; seconds: number }> = [];

for (const sample of [...catalogSamples, ...extraSamples]) {
  const started = performance.now();
  const harness = createWebGl2Harness();
  const scene = sample.build(harness);
  const alloc = await measureFrameAllocation(harness, scene.root, {
    beforeFrame: scene.beforeFrame,
    warmup: sample.warmup,
  });
  const seconds = (performance.now() - started) / 1000;

  results.push({ id: sample.id, ...alloc, seconds });
  console.log(`${sample.id.padEnd(38)} ${(alloc.bytesPerFrame / 1024).toFixed(2).padStart(10)} KB/frame  ${seconds.toFixed(1).padStart(6)}s`);

  scene.teardown?.();
  harness.destroy();
}

const reference = includeReference ? await runReference() : null;

if (reference !== null) {
  const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

  console.log(`\n${reference.id} [reference, ${reference.seconds.toFixed(1)}s]`);
  console.log(
    `  cold/bootstrap   ${mb(reference.cold.totalBytes).padStart(10)} MB one-time  ` +
      `(frame 1 alone ${mb(reference.cold.firstFrameBytes)} MB; window = first ${reference.cold.frames} frames)`,
  );
  console.log(
    `  steady-state     ${(reference.steady.medianBytesPerFrame / 1024).toFixed(2).padStart(10)} KB/frame   ` +
      `(warm-up ${reference.steady.warmup}, median of ${reference.steady.windowsBytesPerFrame.length}x${reference.steady.frames} frames: ` +
      `[${reference.steady.windowsBytesPerFrame.map(b => (b / 1024).toFixed(1)).join(', ')}])`,
  );
}

const outDir = resolve(process.cwd(), '.workspace/output/render-perf');
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, 'allocation.json');
writeFileSync(
  outPath,
  `${JSON.stringify({ env: `Node ${process.version} ${process.platform}/${process.arch}`, results, ...(reference === null ? {} : { reference }) }, null, 2)}\n`,
);

console.log(`\nWrote ${outPath}`);
