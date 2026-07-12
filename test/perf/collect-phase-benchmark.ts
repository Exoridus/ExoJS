/**
 * Collect-path phase profile — CPU baseline for the immediate-mode draw-plan
 * build/optimize/play pipeline (Track B, static-subtree-skip prep).
 *
 * MEASUREMENT ONLY (Tier B/C, informational — never a CI gate). Run via:
 *
 *   pnpm perf:bench:collect-phase   # or: npx tsx test/perf/collect-phase-benchmark.ts (needs a prior pnpm build)
 *
 * What this measures
 * -------------------
 * Every frame the engine rebuilds the entire draw plan from scratch
 * (immediate mode): RenderPlanBuilder.build() -> RenderPlanOptimizer.optimize()
 * -> RenderPlanPlayer.play() (see src/rendering/plan/playRenderTree.ts). This
 * script isolates those three stages cleanly (they're already separate calls,
 * zero instrumentation needed), then goes one level deeper and attributes
 * build()'s internal cost to four named sub-phases — traversal, cull,
 * world-transform, material-key — via temporary prototype-method wrapping
 * (monkeypatching) installed and removed entirely within this file. No file
 * under src/ is modified.
 *
 * Two independent measurement passes per scenario:
 *
 *   Pass A (clean)        — build()/optimize()/play() timed directly with
 *                            performance.now(), zero added overhead. These are
 *                            the reliable, load-bearing numbers.
 *   Pass B (instrumented) — the same pipeline run again with the four
 *                            sub-phase methods wrapped to accumulate
 *                            exclusive (self) time via a call-stack-based
 *                            profiler. Wrapping adds overhead, which inflates
 *                            Pass B's own build() total — so Pass B is used
 *                            only for the *proportional* split between the
 *                            four sub-phases, and those fractions are then
 *                            applied to Pass A's clean build() median to get
 *                            indicative (not exact) absolute sub-phase costs.
 *
 * See the "METHODOLOGY NOTES" block near the bottom of the output for the
 * honesty caveats this produces.
 */

import { performance } from 'node:perf_hooks';

import { SceneNode } from '../../src/core/SceneNode';
import { Container } from '../../src/rendering/Container';
import type { Drawable as DrawableType } from '../../src/rendering/Drawable';
import { Drawable } from '../../src/rendering/Drawable';
import { RenderEntryKind } from '../../src/rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '../../src/rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '../../src/rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '../../src/rendering/plan/RenderPlanPlayer';
import type { ScopeEntry } from '../../src/rendering/plan/RenderScope';
import type { RenderBackend } from '../../src/rendering/RenderBackend';
import { RenderBackendType } from '../../src/rendering/RenderBackendType';
import type { RenderNode } from '../../src/rendering/RenderNode';
import { createRenderStats, resetRenderStats } from '../../src/rendering/RenderStats';
import { RenderTarget } from '../../src/rendering/RenderTarget';
import { RenderTexture } from '../../src/rendering/texture/RenderTexture';
import { TransformBuffer } from '../../src/rendering/TransformBuffer';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NODE_COUNTS = [1000, 5000, 10000] as const;
const MODES = ['static', 'mixed'] as const;
type Mode = (typeof MODES)[number];

const WARMUP_FRAMES = 15;
const ITERATIONS = 41; // odd count -> clean median index; enough samples for a stable p95
const MUTATED_FRACTION = 0.075; // ~7.5% of all nodes mutate per frame in "mixed" mode

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;
// World span used to scatter leaves: 2x the viewport in each dimension,
// centered on the default view center (400, 300) -> roughly a quarter of
// leaves land inside the view per frame (see reported avgDrawn/avgCulled for
// the actual, measured ratio -- this is a planning target, not a guarantee).
const WORLD_OX = -400;
const WORLD_OY = -300;
const WORLD_W = 1600;
const WORLD_H = 1200;

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) -- reproducible fixtures across runs.
// ---------------------------------------------------------------------------

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------------
// Stress-graph fixture: mixed width + depth, not a flat grid.
//
// ~10% of the node budget is spent on a handful of long single-child chains
// (deep, narrow -- e.g. nested UI/parallax layers), the rest on a randomized
// bushy tree (2-7 children per container, ~35% chance of nesting another
// container instead of placing a leaf, up to depth 8). This is deliberately
// NOT the flat 1-level grid used by the existing test/bench/rendering.bench.ts
// and test/perf/rendering-benchmark.ts scenarios -- those only exercise
// width, never depth.
// ---------------------------------------------------------------------------

interface StressTree {
  readonly root: Container;
  /** Every node in the tree, root included (root is index 0). */
  readonly allNodes: readonly RenderNode[];
  readonly leaves: readonly DrawableType[];
}

const buildStressTree = (targetCount: number, seed: number): StressTree => {
  const rng = mulberry32(seed);
  const root = new Container();
  const allNodes: RenderNode[] = [root];
  const leaves: DrawableType[] = [];
  let remaining = targetCount - 1;

  const addLeafAt = (parent: Container): void => {
    if (remaining <= 0) return;

    const leaf = new Drawable();

    leaf.getLocalBounds().set(0, 0, 16, 16);
    leaf.setPosition(WORLD_OX + rng() * WORLD_W, WORLD_OY + rng() * WORLD_H);
    parent.addChild(leaf);
    leaves.push(leaf);
    allNodes.push(leaf);
    remaining--;
  };

  const addContainerAt = (parent: Container): Container => {
    const c = new Container();

    c.setPosition((rng() - 0.5) * 30, (rng() - 0.5) * 30);
    parent.addChild(c);
    allNodes.push(c);
    remaining--;

    return c;
  };

  // Deep-chain portion (~10% of budget): a handful of long single-child
  // chains terminating in a few leaves each.
  const deepBudget = Math.floor(targetCount * 0.1);
  const chainCount = 5;
  let deepBudgetLeft = deepBudget;

  for (let c = 0; c < chainCount && deepBudgetLeft > 4 && remaining > 4; c++) {
    const chainLen = Math.max(1, Math.floor(deepBudgetLeft / (chainCount - c)) - 2);
    let cursor: Container = root;

    for (let i = 0; i < chainLen && remaining > 0; i++) {
      cursor = addContainerAt(cursor);
      deepBudgetLeft--;
    }

    for (let i = 0; i < 3 && remaining > 0; i++) {
      addLeafAt(cursor);
      deepBudgetLeft--;
    }
  }

  // Bushy portion (remaining budget): randomized width/depth tree.
  const maxBushyDepth = 8;
  const buildBushy = (parent: Container, depth: number): void => {
    if (remaining <= 0) return;

    const childCount = 2 + Math.floor(rng() * 6);

    for (let i = 0; i < childCount && remaining > 0; i++) {
      const goDeeper = depth < maxBushyDepth && rng() < 0.35 && remaining > 6;

      if (goDeeper) {
        const c = addContainerAt(parent);

        buildBushy(c, depth + 1);
      } else {
        addLeafAt(parent);
      }
    }
  };

  buildBushy(root, 0);

  while (remaining > 0) addLeafAt(root);

  return { root, allNodes, leaves };
};

// ---------------------------------------------------------------------------
// Stub backend -- CPU-stub only (no GPU submission), matching the convention
// in test/bench/rendering.bench.ts and test/perf/rendering-benchmark.ts. This
// one adds `_prepareRenderGroupUpload`, wiring a REAL TransformBuffer.write()
// call per draw so the "transform-write" phase is actually exercised --
// neither of the existing stub backends implements this hook, so today's
// benches never pay this cost at all.
// ---------------------------------------------------------------------------

let transformWriteAccumMs = 0;

const createStubRuntime = (): RenderBackend => {
  const renderTarget = new RenderTarget(VIEWPORT_W, VIEWPORT_H, true);
  const stats = createRenderStats();
  const transformBuffer = new TransformBuffer();

  return {
    backendType: RenderBackendType.WebGl2,
    stats,
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      transformBuffer.begin();

      return this;
    },
    clear() {
      return this;
    },
    resize(w: number, h: number) {
      renderTarget.resize(w, h);

      return this;
    },
    setView(v) {
      renderTarget.setView(v);

      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w: number, h: number) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture(t: RenderTexture) {
      t.destroy();

      return this;
    },
    draw() {
      stats.submittedNodes++;

      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
    // Mirrors WebGl2Backend._prepareRenderGroupUpload (src/rendering/webgl2/WebGl2Backend.ts):
    // packs every draw command's world transform + tint into the shared
    // TransformBuffer at the group's upload boundary. This is real production
    // code (TransformBuffer.write), just invoked from a bench-authored hook.
    _prepareRenderGroupUpload(entries: readonly ScopeEntry[], startIndex: number, count: number) {
      const end = startIndex + count;
      const hookStart = performance.now();

      for (let i = startIndex; i < end; i++) {
        const entry = entries[i]!;

        if (entry.kind !== RenderEntryKind.Draw) continue;

        const command = entry.command;

        transformBuffer.write(command.nodeIndex, command.drawable.getGlobalTransform(), command.drawable.tint);
      }

      transformWriteAccumMs += performance.now() - hookStart;
    },
  } as unknown as RenderBackend;
};

// ---------------------------------------------------------------------------
// Instrumentation harness (Pass B only): temporary prototype wrapping with
// exclusive (self) time accounting via an explicit call-stack. Installed and
// removed within a single scenario run; never touches any file under src/.
//
// Exclusivity: only WRAPPED calls push a frame. When a wrapped call invokes
// another wrapped call (possibly through several unwrapped intermediate
// calls, e.g. RenderPlanBuilder.emitNode/emitDraw are never wrapped), the
// inner call's elapsed time is added to the nearest *enclosing wrapped
// frame's* childTime and subtracted from that frame's self time -- so a
// child's cost is never double-counted into its parent's bucket, regardless
// of how many unwrapped frames sit between them.
// ---------------------------------------------------------------------------

type PhaseName = 'traversal' | 'cull' | 'world-transform' | 'material-key';

interface ProfileFrame {
  start: number;
  childTime: number;
}

const phaseTotals: Record<PhaseName, number> = {
  traversal: 0,
  cull: 0,
  'world-transform': 0,
  'material-key': 0,
};

const callStack: ProfileFrame[] = [];

const resetPhaseTotals = (): void => {
  phaseTotals.traversal = 0;
  phaseTotals.cull = 0;
  phaseTotals['world-transform'] = 0;
  phaseTotals['material-key'] = 0;
};

const instrument = (proto: any, method: string, phase: PhaseName): (() => void) => {
  const original = proto[method] as (...args: unknown[]) => unknown;

  proto[method] = function (this: unknown, ...args: unknown[]): unknown {
    const frame: ProfileFrame = { start: performance.now(), childTime: 0 };

    callStack.push(frame);

    try {
      return original.apply(this, args);
    } finally {
      callStack.pop();

      const elapsed = performance.now() - frame.start;
      const selfTime = elapsed - frame.childTime;

      phaseTotals[phase] += selfTime;

      const parent = callStack[callStack.length - 1];

      if (parent) parent.childTime += elapsed;
    }
  };

  return () => {
    proto[method] = original;
  };
};

const installInstrumentation = (): (() => void) => {
  const uninstallers = [
    instrument(Container.prototype, '_collect', 'traversal'),
    instrument(Container.prototype, '_collectContent', 'traversal'),
    instrument(Drawable.prototype, '_collect', 'traversal'),
    instrument(SceneNode.prototype, 'inView', 'cull'),
    instrument(SceneNode.prototype, 'getGlobalTransform', 'world-transform'),
    instrument(Drawable.prototype, '_getOrComputeMaterialKey', 'material-key'),
  ];

  return () => {
    for (const uninstall of uninstallers) uninstall();
  };
};

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);
const percentile = (values: readonly number[], p: number): number => {
  const s = sorted(values);

  if (s.length === 0) return 0;

  const idx = Math.min(s.length - 1, Math.floor(p * s.length));

  return s[idx]!;
};
const median = (values: readonly number[]): number => percentile(values, 0.5);
const p95 = (values: readonly number[]): number => percentile(values, 0.95);
const round = (n: number, digits = 4): number => Number(n.toFixed(digits));

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

interface CleanSamples {
  build: number[];
  optimize: number[];
  play: number[];
  transformWrite: number[];
  /**
   * Cost of applying this frame's mutations (SceneNode.setPosition), measured
   * OUTSIDE build/optimize/play. Reported separately because
   * `_invalidateSubtreeTransform` (see src/core/SceneNode.ts) eagerly cascades
   * the dirty GlobalTransform/BoundsRect flags down the WHOLE subtree of a
   * touched container at mutation time -- not lazily during collect. So a
   * container-level mutation's true per-frame cost is
   * mutate-cascade (this bucket) + collect (build, mostly cull/world-transform
   * sub-phases) -- both belong to "something moved this frame."
   */
  mutate: number[];
}

interface InstrumentedSamples {
  buildTotal: number[];
  traversal: number[];
  cull: number[];
  worldTransform: number[];
  materialKey: number[];
}

interface ScenarioReport {
  nodeCount: number;
  actualNodeCount: number;
  mode: Mode;
  avgDrawn: number;
  avgCulled: number;
  clean: CleanSamples;
  instrumented: InstrumentedSamples;
}

const applyMutations = (touched: ReadonlyArray<{ node: RenderNode; baseX: number; baseY: number }>, frame: number): void => {
  for (let i = 0; i < touched.length; i++) {
    const t = touched[i]!;
    const dx = Math.sin(frame * 0.3 + i) * 4;
    const dy = Math.cos(frame * 0.3 + i) * 4;

    t.node.setPosition(t.baseX + dx, t.baseY + dy);
  }
};

const runScenario = (targetNodeCount: number, mode: Mode): ScenarioReport => {
  const tree = buildStressTree(targetNodeCount, targetNodeCount * 7919 + (mode === 'mixed' ? 1 : 0));
  const runtime = createStubRuntime();

  const mutationRng = mulberry32(targetNodeCount * 104729);
  const touched =
    mode === 'mixed'
      ? tree.allNodes
          .filter(n => n !== tree.root)
          .filter(() => mutationRng() < MUTATED_FRACTION)
          .map(node => ({ node, baseX: node.x, baseY: node.y }))
      : [];

  const clean: CleanSamples = { build: [], optimize: [], play: [], transformWrite: [], mutate: [] };
  const instrumented: InstrumentedSamples = { buildTotal: [], traversal: [], cull: [], worldTransform: [], materialKey: [] };

  let drawnSum = 0;
  let culledSum = 0;
  let statSamples = 0;

  const runOneFrame = (frame: number): void => {
    runtime.resetStats();

    const tm0 = performance.now();

    if (mode === 'mixed') applyMutations(touched, frame);

    clean.mutate.push(performance.now() - tm0);

    transformWriteAccumMs = 0;

    const builder = RenderPlanBuilder.acquire();
    const t0 = performance.now();
    const plan = builder.build(tree.root, runtime);
    const t1 = performance.now();

    RenderPlanOptimizer.optimize(plan);
    const t2 = performance.now();

    RenderPlanPlayer.play(plan, runtime);
    const t3 = performance.now();

    runtime.flush();
    RenderPlanBuilder.release(builder);

    clean.build.push(t1 - t0);
    clean.optimize.push(t2 - t1);
    clean.play.push(t3 - t2);
    clean.transformWrite.push(transformWriteAccumMs);

    drawnSum += runtime.stats.submittedNodes;
    culledSum += runtime.stats.culledNodes;
    statSamples++;
  };

  // --- Warmup: JIT + settle dirty flags (static: fully clears after frame 1;
  // mixed: touched subset stays dirty every frame by construction). ---
  for (let f = 0; f < WARMUP_FRAMES; f++) runOneFrame(f);

  drawnSum = 0;
  culledSum = 0;
  statSamples = 0;
  clean.build.length = 0;
  clean.optimize.length = 0;
  clean.play.length = 0;
  clean.transformWrite.length = 0;
  clean.mutate.length = 0;

  // --- Pass A: clean timings, zero instrumentation overhead. ---
  for (let f = 0; f < ITERATIONS; f++) runOneFrame(WARMUP_FRAMES + f);

  // --- Pass B: instrumented timings (build() only needs re-measuring; we
  // still run optimize+play each iteration so pool/dirty state advances
  // identically to Pass A). ---
  const uninstall = installInstrumentation();

  for (let f = 0; f < ITERATIONS; f++) {
    runtime.resetStats();

    if (mode === 'mixed') applyMutations(touched, WARMUP_FRAMES + ITERATIONS + f);

    resetPhaseTotals();

    const builder = RenderPlanBuilder.acquire();
    const tb0 = performance.now();
    const plan = builder.build(tree.root, runtime);
    const tb1 = performance.now();

    RenderPlanOptimizer.optimize(plan);
    RenderPlanPlayer.play(plan, runtime);
    runtime.flush();
    RenderPlanBuilder.release(builder);

    instrumented.buildTotal.push(tb1 - tb0);
    instrumented.traversal.push(phaseTotals.traversal);
    instrumented.cull.push(phaseTotals.cull);
    instrumented.worldTransform.push(phaseTotals['world-transform']);
    instrumented.materialKey.push(phaseTotals['material-key']);
  }

  uninstall();

  runtime.destroy();
  tree.root.destroy();

  return {
    nodeCount: targetNodeCount,
    actualNodeCount: tree.allNodes.length,
    mode,
    avgDrawn: round(drawnSum / statSamples, 1),
    avgCulled: round(culledSum / statSamples, 1),
    clean,
    instrumented,
  };
};

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const fmtMs = (n: number): string => `${round(n, 4)}`;

const printReport = (report: ScenarioReport): void => {
  const { clean, instrumented } = report;

  const buildMed = median(clean.build);
  const buildP95 = p95(clean.build);
  const optMed = median(clean.optimize);
  const optP95 = p95(clean.optimize);
  const playMed = median(clean.play);
  const playP95 = p95(clean.play);
  const twMed = median(clean.transformWrite);
  const twP95 = p95(clean.transformWrite);
  const playOtherSeries = clean.play.map((v, i) => v - clean.transformWrite[i]!);
  const playOtherMed = median(playOtherSeries);
  const playOtherP95 = p95(playOtherSeries);

  const mutateMed = median(clean.mutate);
  const mutateP95 = p95(clean.mutate);
  const totalMed = buildMed + optMed + playMed;
  const trueFrameMed = mutateMed + totalMed;

  const instrBuildMed = median(instrumented.buildTotal);
  const travMed = median(instrumented.traversal);
  const cullMed = median(instrumented.cull);
  const wtMed = median(instrumented.worldTransform);
  const mkMed = median(instrumented.materialKey);

  const travFrac = instrBuildMed > 0 ? travMed / instrBuildMed : 0;
  const cullFrac = instrBuildMed > 0 ? cullMed / instrBuildMed : 0;
  const wtFrac = instrBuildMed > 0 ? wtMed / instrBuildMed : 0;
  const mkFrac = instrBuildMed > 0 ? mkMed / instrBuildMed : 0;

  const travAbs = travFrac * buildMed;
  const cullAbs = cullFrac * buildMed;
  const wtAbs = wtFrac * buildMed;
  const mkAbs = mkFrac * buildMed;
  const residual = buildMed - (travAbs + cullAbs + wtAbs + mkAbs);

  console.log(`\n=== nodes=${report.nodeCount} (actual ${report.actualNodeCount}) mode=${report.mode} ===`);
  console.log(`  avg drawn=${report.avgDrawn}  avg culled=${report.avgCulled}`);
  console.log(`  --- Pass A (clean, reliable) ---`);
  if (report.mode === 'mixed') {
    console.log(`  mutate (SceneNode.setPosition + eager subtree-dirty cascade, OUTSIDE collect): median=${fmtMs(mutateMed)}ms  p95=${fmtMs(mutateP95)}ms`);
  }
  console.log(`  build:            median=${fmtMs(buildMed)}ms  p95=${fmtMs(buildP95)}ms`);
  console.log(`  optimize:         median=${fmtMs(optMed)}ms  p95=${fmtMs(optP95)}ms`);
  console.log(`  play (total):     median=${fmtMs(playMed)}ms  p95=${fmtMs(playP95)}ms`);
  console.log(`    play/transform-write: median=${fmtMs(twMed)}ms  p95=${fmtMs(twP95)}ms`);
  console.log(`    play/other:           median=${fmtMs(playOtherMed)}ms  p95=${fmtMs(playOtherP95)}ms`);
  console.log(`  TOTAL (build+optimize+play): median=${fmtMs(totalMed)}ms`);
  if (report.mode === 'mixed') {
    console.log(`  TRUE FRAME TOTAL (mutate + build+optimize+play): median=${fmtMs(trueFrameMed)}ms`);
  }
  console.log(`  --- Pass B (instrumented, indicative sub-phases of build()) ---`);
  console.log(`  instrumented build total: median=${fmtMs(instrBuildMed)}ms  (inflated vs clean build; proportions only)`);
  console.log(`    traversal:       ${(travFrac * 100).toFixed(1)}% of instrumented build -> est. ${fmtMs(travAbs)}ms of clean build`);
  console.log(`    cull:            ${(cullFrac * 100).toFixed(1)}% of instrumented build -> est. ${fmtMs(cullAbs)}ms of clean build`);
  console.log(`    world-transform: ${(wtFrac * 100).toFixed(1)}% of instrumented build -> est. ${fmtMs(wtAbs)}ms of clean build`);
  console.log(`    material-key:    ${(mkFrac * 100).toFixed(1)}% of instrumented build -> est. ${fmtMs(mkAbs)}ms of clean build`);
  console.log(`    residual (builder bookkeeping / unattributed): est. ${fmtMs(residual)}ms of clean build`);
};

/**
 * Noise floor for the static-vs-mixed build-phase delta (review S2). Below
 * this magnitude a delta is not distinguishable from run-to-run measurement
 * noise on this CPU-stub harness (single-process `performance.now()` samples,
 * no median-of-runs). This was previously only a per-line `[<30% -- flag as
 * possible noise]` suffix easy to miss when skimming stdout; it is now also
 * collected into a single, impossible-to-miss advisory block at the end of
 * the run (see the "NOISE ADVISORY" section below) so a sub-floor delta can
 * never be quoted as a real change without also seeing the flag.
 */
const NOISE_FLOOR_PCT = 30;

const run = (): void => {
  console.log('=============================================================');
  console.log('ExoJS collect-path phase profile — CPU-STUB BACKEND, NO GPU (review S1/S3)');
  console.log('MEASUREMENT ONLY: never a CI gate. This stub is NOT comparable to');
  console.log('the real WebGL2/WebGPU backend, NOR to the other CPU-stub benches');
  console.log('under test/bench/*.bench.ts — this one additionally wires a real');
  console.log('TransformBuffer.write() via a bench-authored `_prepareRenderGroupUpload`');
  console.log('hook the other stubs omit (review S1), so its numbers are internally');
  console.log('consistent (exojs-vs-exojs across versions) but not cross-bench.');
  console.log('Never cite an absolute ms figure from this file as "engine perf".');
  console.log('=============================================================');
  console.log(`iterations=${ITERATIONS} warmup=${WARMUP_FRAMES} mutatedFraction(mixed mode)=${MUTATED_FRACTION} noiseFloor=${NOISE_FLOOR_PCT}%`);

  const reports: ScenarioReport[] = [];

  for (const nodeCount of NODE_COUNTS) {
    for (const mode of MODES) {
      reports.push(runScenario(nodeCount, mode));
    }
  }

  for (const report of reports) printReport(report);

  console.log('\n=== Static-vs-mixed delta (build phase, clean median) ===');

  const subFloorDeltas: string[] = [];

  for (const nodeCount of NODE_COUNTS) {
    const staticReport = reports.find(r => r.nodeCount === nodeCount && r.mode === 'static')!;
    const mixedReport = reports.find(r => r.nodeCount === nodeCount && r.mode === 'mixed')!;
    const staticBuild = median(staticReport.clean.build);
    const mixedBuild = median(mixedReport.clean.build);
    const delta = mixedBuild - staticBuild;
    const deltaPct = staticBuild > 0 ? (delta / staticBuild) * 100 : 0;
    const belowFloor = Math.abs(deltaPct) < NOISE_FLOOR_PCT;
    const line = `nodes=${nodeCount}: static=${fmtMs(staticBuild)}ms mixed=${fmtMs(mixedBuild)}ms delta=${fmtMs(delta)}ms (${deltaPct.toFixed(1)}%)`;

    console.log(`  ${line}${belowFloor ? `  [<${NOISE_FLOOR_PCT}% -- flag as possible noise]` : ''}`);

    if (belowFloor) {
      subFloorDeltas.push(line);
    }
  }

  // S2 — fold the noise-floor flag into a summary block, not just a per-line
  // suffix: a reader skimming only the bottom of stdout still sees which
  // deltas are sub-floor and must not be quoted as real changes.
  if (subFloorDeltas.length > 0) {
    console.log(`\n!!! NOISE ADVISORY: ${subFloorDeltas.length} delta(s) below the ${NOISE_FLOOR_PCT}% noise floor — do NOT quote these as real changes !!!`);

    for (const line of subFloorDeltas) {
      console.log(`  - ${line}`);
    }
  }
};

run();
