import { describe, expect, it } from 'vitest';

import { measureFrameAllocation } from './allocation';
import { buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness } from './harness';
import { buildScenarioCatalog } from './scenarios';

/**
 * Render-plan allocation gate (spec 04 §2a). Samples the per-frame allocation
 * RATE (throwaway garbage, not retained heap) on an empty, a static, and a moving
 * reference scene via the V8 allocation sampling profiler (see `allocation.ts`).
 *
 * The sampler needs no `--expose-gc` and the budget is always enforced — but it
 * is only correct because `allocation.ts` passes `includeObjectsCollectedBy*GC`
 * to `startSampling`. Without those flags the profiler reports ONLY objects still
 * live at stop, discarding the immediately-dead plan garbage (a ~500× undercount).
 * The `sampler counts dead garbage` test below guards that invariant.
 *
 * Budgets are the measured status quo plus headroom; they tighten as 2b–2f drive
 * the static scene toward ~0 plan garbage/frame.
 *
 * NOTE: the source-accurate numbers come from THIS test (the vitest `rendering-perf`
 * project resolves `#*` imports to `src` and wires GLSL). The standalone
 * `pnpm perf:renderers:alloc` launcher resolves `#*` to the built `dist/esm` (its
 * `default` import condition) and so reports the LAST BUILD, not the working tree —
 * use it only as a rough cross-check, not as the before/after gate.
 */

// Budgets (bytes/frame), measured against src. empty ≈ 2.6 KB (harness/recorder
// floor). After Slice 2b (DrawCommand/ScopeEntry pooled, MaterialKey cached):
// static ≈ 317 KB (was ≈ 644), moving ≈ 580 KB (was ≈ 916). The remainder is the
// RenderPlanOptimizer (→ 2f) + per-scope collectRenderGroups (→ 2c). ~1.3× headroom
// for the statistical sampler; tighten again per following slice.
const EMPTY_BUDGET = 16 * 1024;
const STATIC_BUDGET = 420 * 1024;
const MOVING_BUDGET = 768 * 1024;

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
});
