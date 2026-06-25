import { describe, expect, it } from 'vitest';

import type { RenderNode } from '#rendering/RenderNode';

import { measureFrameAllocation } from './allocation';
import { buildFilteredScene, buildMeshScene, buildNestedScene, buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness } from './harness';
import { buildScenarioCatalog } from './scenarios';

/**
 * Render-plan allocation gate (spec 04 §2a). Samples the per-frame allocation
 * RATE (throwaway garbage, not retained heap) on reference scenes via the V8
 * allocation sampling profiler (see `allocation.ts`).
 *
 * The sampler needs no `--expose-gc` and the budget is always enforced — but it
 * is only correct because `allocation.ts` passes `includeObjectsCollectedBy*GC`
 * to `startSampling`. Without those flags the profiler reports ONLY objects still
 * live at stop, discarding the immediately-dead plan garbage (a ~500× undercount).
 * The `sampler counts dead garbage` test below guards that invariant.
 *
 * NOTE: the source-accurate numbers come from THIS test (the vitest `rendering-perf`
 * project resolves `#*` imports to `src` and wires GLSL). The standalone
 * `pnpm perf:renderers:alloc` launcher resolves `#*` to the built `dist/esm` and so
 * reports the LAST BUILD, not the working tree — use it only as a rough cross-check.
 * Budgets ratchet down per slice; run with `--disableConsoleIntercept` to see them.
 */

// Sprite reference budgets (bytes/frame), measured against src. empty ≈ 2.2 KB
// (harness/recorder floor). After Slice 2c (collectRenderGroups eliminated — the
// plan player walks groupIndex adjacency over scope.entries inline, so no
// per-scope RenderGroup[]/instructions[] is materialized each frame): static
// ≈ 288 KB (was ≈ 318 post-2b), moving ≈ 550 KB (was ≈ 578).
const EMPTY_BUDGET = 16 * 1024;
const STATIC_BUDGET = 384 * 1024;
const MOVING_BUDGET = 736 * 1024;

// Complex-scene budgets — these exercise the paths flat sprites hide: many Group
// scopes (deep nesting → per-scope plan work, 2c) and per-effect Barrier scopes
// + child plans (2c). 2c eliminated the per-scope group materialization, so the
// scope-heavy scenes dropped the most: nested 431→363, filtered 1425→1310 KB.
// 2e eliminated the WebGl2 mesh renderer's per-batch `slice()` copy and the
// per-mesh `PendingMeshDraw` literal (the queue now pools its slots and
// `_drawStaticBatch` walks an index range), dropping mesh 753→644 KB.
// Source-accurate post-2e status quo + ~1.3× headroom.
const NESTED_BUDGET = 480 * 1024;
const MESH_BUDGET = 832 * 1024;
const FILTERED_BUDGET = 1728 * 1024;

const findScenario = (id: string): ReturnType<typeof buildScenarioCatalog>[number] => {
  const scenario = buildScenarioCatalog('full').find(s => s.id === id);

  if (scenario === undefined) {
    throw new Error(`scenario not found: ${id}`);
  }

  return scenario;
};

const log = (label: string, bytesPerFrame: number): void => {
  console.log(`[alloc] ${label.padEnd(20)} ${(bytesPerFrame / 1024).toFixed(2).padStart(9)} KB/frame`);
};

/** Build-and-measure a scene whose root is supplied directly (no scenario catalog). */
const measureScene = async (label: string, root: RenderNode, budget: number): Promise<void> => {
  const harness = createWebGl2Harness();

  const alloc = await measureFrameAllocation(harness, root);
  log(label, alloc.bytesPerFrame);

  root.destroy();
  harness.destroy();

  expect(alloc.bytesPerFrame).toBeLessThan(budget);
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

  it('empty scene allocates near-nothing (harness/sampler sanity)', async () => {
    const harness = createWebGl2Harness();
    const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

    const alloc = await measureFrameAllocation(harness, root);
    log('empty', alloc.bytesPerFrame);

    root.destroy();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(EMPTY_BUDGET);
  });

  it('static sprite scene stays within the plan-allocation budget', async () => {
    const harness = createWebGl2Harness();
    const scene = findScenario('sprite/1000/1tex/static').build(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });
    log('sprite/1000 static', alloc.bytesPerFrame);

    scene.teardown?.();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(STATIC_BUDGET);
  });

  it('moving sprite scene stays within the (looser) moving budget', async () => {
    const harness = createWebGl2Harness();
    const scene = findScenario('sprite/1000/1tex/moving').build(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });
    log('sprite/1000 moving', alloc.bytesPerFrame);

    scene.teardown?.();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(MOVING_BUDGET);
  });

  it('nested hierarchy (deep group scopes) stays within budget', () =>
    measureScene('nested/1000 d4', buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: makeTextures(1) }).root, NESTED_BUDGET));

  it('mesh drawables stay within budget', () => measureScene('mesh/1000', buildMeshScene({ count: 1000, textures: makeTextures(1) }).root, MESH_BUDGET));

  it('effect-barrier scene stays within budget', () => measureScene('filtered/100', buildFilteredScene({ count: 100, textures: makeTextures(1) }).root, FILTERED_BUDGET));
});
