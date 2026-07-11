import { describe, expect, it } from 'vitest';

import type { RenderNode } from '#rendering/RenderNode';

import { measureFrameAllocation } from './allocation';
import { buildFilteredScene, buildMeshScene, buildNestedScene, buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness, type WebGl2Harness } from './harness';
import { buildScenarioCatalog } from './scenarios';

/**
 * Render-plan allocation gate (spec 04 §2a; review finding R1/R2 hardening).
 * Samples the per-frame allocation RATE (throwaway garbage, not retained heap)
 * on reference scenes via the V8 allocation sampling profiler (see
 * `allocation.ts`).
 *
 * ── Methodology (R1/R2 fix) ─────────────────────────────────────────────────
 * The sampler is a STATISTICAL profiler (Poisson, one sample per 512 B), so a
 * single run scatters ±few-percent frame-to-frame. The previous gate asserted a
 * hard `toBeLessThan` on ONE such run against a budget with ~1.34× headroom —
 * pass/fail was environment luck (a clean tree measured +4% over budget on the
 * dev box) and the wide headroom simultaneously hid real ≤25% regressions.
 *
 * This gate instead takes the MEDIAN of {@link WINDOWS} independent sampling
 * windows (each its own fresh harness + profiler session) and asserts the median
 * against a budget of `documented-baseline-median × TOLERANCE`. The median is
 * immune to the occasional high outlier (see the `samples=[…]` log line — one
 * window routinely lands ~13% high while the median sits within ~0.5% run to
 * run), so the gate is reproducible; the 1.15 band is tight enough to catch a
 * real ≥15% allocation regression while absorbing cross-machine / cross-Node
 * drift. Baselines below were measured across 3×7-window passes; the median
 * varied < 1% run-to-run on the environment recorded in {@link BASELINE_KB}.
 *
 * Update the baseline table when a slice deliberately changes allocation: run
 * with `--disableConsoleIntercept` to read the `[alloc]` medians, paste the new
 * numbers into {@link BASELINE_KB}, and record the environment + reason.
 *
 * NOTE: the source-accurate numbers come from THIS test (the vitest `rendering-perf`
 * project resolves `#*` imports to `src` and wires GLSL). The standalone
 * `pnpm perf:renderers:alloc` launcher resolves `#*` to the built `dist/esm` and so
 * reports the LAST BUILD, not the working tree — use it only as a rough cross-check.
 */

/** Independent sampling windows the median is taken over (R2: ≥5). */
const WINDOWS = 5;
/** Budget = baseline median × this. 15% band: catches a real ≥15% regression, absorbs sampler/machine drift. */
const TOLERANCE = 1.15;

/**
 * Documented baseline MEDIANS in KB/frame — the medians THIS gate itself
 * produces (measured by running this test), against `src` on Node v24.14.1
 * (win32/x64) on 2026-07-11 across repeated 5-window passes. Per-scene
 * run-to-run median drift was < 1% (static 248–249, moving 574, nested 362–364,
 * mesh 645–646, filtered 823); single-window spread ≤ 14%, which the median
 * absorbs. Measure them from the gate, not an isolated micro-bench: the moving
 * scene's median is ~5% higher in-suite (JIT tier state depends on the scenes
 * that ran before it in the worker), so an isolated number would set a falsely
 * tight budget. The live environment is printed in every `[alloc]` line and in
 * the failure message so budget drift on another Node/OS is auditable.
 *
 * Scenes (why each is here — they exercise paths flat sprites hide):
 *   static   — 1000 sprites, steady state: the plan-build fast paths (pooled
 *              DrawCommand/ScopeEntry/MaterialKey, inline group walk).
 *   moving   — 1000 sprites moved every frame: adds the per-frame transform
 *              re-upload path.
 *   nested   — 1000 sprites in a depth-4 container hierarchy: many Group scopes.
 *   mesh     — 1000 textured-quad meshes: the mesh-renderer draw path (2e).
 *   filtered — 100 sprites each with a ColorFilter: a Barrier scope + child plan
 *              per sprite (the effect-node path).
 */
const BASELINE_KB = {
  static: 248,
  moving: 574,
  nested: 363,
  mesh: 646,
  filtered: 823,
} as const;

/** Budget in bytes/frame for a documented KB baseline median. */
const budgetBytes = (baselineKb: number): number => baselineKb * TOLERANCE * 1024;

/**
 * Empty scene is a harness/sampler FLOOR sanity, not a ratcheted budget: its
 * true value (~2.3 KB) is near zero and noise-dominated (~35% window spread on
 * a ~1 KB absolute base), so the 1.15 band is meaningless here. A fixed, roomy
 * floor catches a gross regression (a real allocation would be orders larger)
 * without flaking on ±1 KB jitter.
 */
const EMPTY_FLOOR_BYTES = 8 * 1024;

const ENV = `Node ${process.version} ${process.platform}/${process.arch}`;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

interface AllocScene {
  readonly root: RenderNode;
  readonly beforeFrame?: () => void;
  readonly teardown?: () => void;
}

/** Builds a fresh harness + scene for one window; caller destroys via the returned teardown. */
type SceneFactory = (harness: WebGl2Harness) => AllocScene;

const findScenario = (id: string): ReturnType<typeof buildScenarioCatalog>[number] => {
  const scenario = buildScenarioCatalog('full').find(s => s.id === id);

  if (scenario === undefined) {
    throw new Error(`scenario not found: ${id}`);
  }

  return scenario;
};

/** Median bytes/frame over {@link WINDOWS} fresh-harness sampling windows, plus the per-window KB samples. */
const measureMedianAllocation = async (factory: SceneFactory): Promise<{ medianBytes: number; samplesKb: number[] }> => {
  const samples: number[] = [];

  for (let i = 0; i < WINDOWS; i++) {
    const harness = createWebGl2Harness();
    const scene = factory(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });

    samples.push(alloc.bytesPerFrame);
    scene.teardown?.();
    harness.destroy();
  }

  return { medianBytes: median(samples), samplesKb: samples.map(b => b / 1024) };
};

/** Measure the median, log the paper-trail line, and gate it against `budget` bytes/frame. */
const gate = async (label: string, factory: SceneFactory, budget: number): Promise<void> => {
  const { medianBytes, samplesKb } = await measureMedianAllocation(factory);
  const medianKb = medianBytes / 1024;
  const budgetKb = budget / 1024;

  console.log(
    `[alloc] ${label.padEnd(20)} median=${medianKb.toFixed(2).padStart(8)} KB/frame  budget=${budgetKb.toFixed(0).padStart(4)} KB  ` +
      `[${ENV}]  windows=[${samplesKb.map(kb => kb.toFixed(0)).join(', ')}]`,
  );

  // Surface the environment + numbers on failure too (the vitest config's
  // `valid-expect` rule forbids expect()'s message argument, so log it here).
  if (medianBytes >= budget) {
    console.error(
      `[alloc] BUDGET EXCEEDED — ${label}: median ${medianKb.toFixed(1)} KB/frame >= budget ${budgetKb.toFixed(0)} KB (${ENV}). ` +
        `If deliberate, re-measure and update BASELINE_KB in allocation.test.ts; otherwise a real allocation regression landed.`,
    );
  }

  expect(medianBytes).toBeLessThan(budget);
};

describe('render-plan allocation gate', () => {
  it('sampler counts dead garbage (guards the GC-inclusion flags)', async () => {
    const harness = createWebGl2Harness();
    const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

    // JSON.parse is opaque to V8's optimizer — it cannot scalar-replace or
    // dead-code the resulting 1000-object array, so the allocation is real and
    // immediately dead (the sink is overwritten each frame).
    const junkJson = `[${'{"a":1,"b":2},'.repeat(999)}{"a":1,"b":2}]`;
    let sink: unknown = null;

    const base = await measureFrameAllocation(harness, root);
    const withJunk = await measureFrameAllocation(harness, root, {
      beforeFrame: (): void => {
        sink = JSON.parse(junkJson) as unknown;
      },
    });

    void sink;
    root.destroy();
    harness.destroy();

    // 1000 small objects ≈ 32–56 B each. If the sampler discarded GC'd garbage
    // this delta would collapse toward 0 (measured ~0.1 B/obj without the flags).
    const bytesPerObject = (withJunk.bytesPerFrame - base.bytesPerFrame) / 1000;
    expect(bytesPerObject).toBeGreaterThan(20);
  });

  it('empty scene allocates near-nothing (harness/sampler floor sanity)', async () => {
    await gate(
      'empty',
      () => {
        const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

        return { root, teardown: () => root.destroy() };
      },
      EMPTY_FLOOR_BYTES,
    );
  }, 60000);

  it('static sprite scene stays within the plan-allocation budget', async () => {
    await gate(
      'sprite/1000 static',
      harness => {
        const scene = findScenario('sprite/1000/1tex/static').build(harness);

        return { root: scene.root, beforeFrame: scene.beforeFrame, teardown: scene.teardown };
      },
      budgetBytes(BASELINE_KB.static),
    );
  }, 60000);

  it('moving sprite scene stays within the (looser) moving budget', async () => {
    await gate(
      'sprite/1000 moving',
      harness => {
        const scene = findScenario('sprite/1000/1tex/moving').build(harness);

        return { root: scene.root, beforeFrame: scene.beforeFrame, teardown: scene.teardown };
      },
      budgetBytes(BASELINE_KB.moving),
    );
  }, 60000);

  it('nested hierarchy (deep group scopes) stays within budget', async () => {
    await gate(
      'nested/1000 d4',
      () => {
        const { root } = buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: makeTextures(1) });

        return { root, teardown: () => root.destroy() };
      },
      budgetBytes(BASELINE_KB.nested),
    );
  }, 60000);

  it('mesh drawables stay within budget', async () => {
    await gate(
      'mesh/1000',
      () => {
        const { root } = buildMeshScene({ count: 1000, textures: makeTextures(1) });

        return { root, teardown: () => root.destroy() };
      },
      budgetBytes(BASELINE_KB.mesh),
    );
  }, 60000);

  it('effect-barrier scene stays within budget', async () => {
    await gate(
      'filtered/100',
      () => {
        const { root } = buildFilteredScene({ count: 100, textures: makeTextures(1) });

        return { root, teardown: () => root.destroy() };
      },
      budgetBytes(BASELINE_KB.filtered),
    );
  }, 60000);
});
