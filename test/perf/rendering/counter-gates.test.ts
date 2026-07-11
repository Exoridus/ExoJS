/**
 * CPU collect-path SHAPE gate (review finding R3/F6). Deterministic, GPU-free,
 * machine-independent.
 *
 * The allocation gate (`allocation.test.ts`) only catches regressions that
 * ALLOCATE. A CPU regression that walks twice as many nodes per frame without
 * allocating — exactly the class of change Track B's collect-path rework can
 * introduce — merges green through every existing gate. This file closes that
 * hole by asserting EXACT algorithmic call-counts on a fixed scene rendered
 * through the CPU-stub WebGL2 harness (`counters.ts` wraps the four hot
 * collect-path methods and tallies invocations for one measured frame).
 *
 * Why `toBe(n)`, not `toBeLessThan(budget)`: these are integer call-counts that
 * depend only on the CPU-side algorithm, so they are identical on every machine
 * and every run (proven: 3 back-to-back processes produced byte-identical
 * numbers, Node 24.14.1). A hard equality is the whole point — it flags a
 * regression AND an improvement, both of which must be a conscious edit here.
 *
 * ── INTEGRATOR NOTE ─────────────────────────────────────────────────────────
 * Parallel Track B workstreams are actively changing the dirty-walk (early-out
 * epoch) and batching (8→16 slots). Those WILL move the pinned numbers below —
 * that is the gate working as designed. When you integrate such a change, update
 * the single `EXPECTED` table below to the new measured values and confirm the
 * DELTA matches your intent (a lower `collect`/`materialKey` is a win; a higher
 * one on the static/retained rows means a fast-path stopped engaging). Re-derive
 * numbers by temporarily logging `measureFrameCounters(...)` output.
 */
import { describe, expect, it } from 'vitest';

import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';

import { type FrameCounters, measureFrameCounters } from './counters';
import { makeTextures } from './fixtures';
import { createWebGl2Harness, type WebGl2Harness } from './harness';

const SPRITE_COUNT = 1000;

/**
 * Pinned per-frame counts, measured on Node 24.14.1 against `src`. Each row is
 * one fixed scene + drive pattern. See each `it` for what a drift means.
 *
 * columns: collect  = RenderNode._collect calls (nodes visited by the walk)
 *          inView   = SceneNode.inView calls (cull checks)
 *          gt       = SceneNode.getGlobalTransform calls (build + play transform reads)
 *          mk       = Drawable._getOrComputeMaterialKey calls (per-draw material keys)
 *          plus the deterministic RenderStats totals (submitted/culled/draws/batches).
 */
const EXPECTED = {
  // Plain Container, nothing changes frame-to-frame. The Slice-1 per-Container
  // retained-plan cache is fully engaged: the root is visited once and all 1000
  // children are replayed from captured slots — zero child _collect, zero cull,
  // zero material-key work. This is the O(1)-visit steady state.
  staticPlain: { collect: 1, inView: 1, globalTransform: 2001, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // Plain Container with the camera panning every frame. The Slice-1 cache keys
  // on View.updateId, so a pan busts it and forces a FULL re-collect: 1 root +
  // 1000 children visited, 1001 cull checks, 1000 material keys. This is the
  // O(n) collect cost — the row that catches "the collect walk regressed to
  // touch every node again". A LOWER number here is an improvement; a HIGHER one
  // (e.g. 2× the visits) is the exact CPU regression R3 warned merges silently.
  panPlain: { collect: 1001, inView: 1001, globalTransform: 6001, materialKey: 1000, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // RetainedContainer with the camera panning every frame. The retained fragment
  // is captured view-independently (spec §4.2 deliberately omits View.updateId
  // and the group's own transform from the key), so a pan does NOT bust it — the
  // whole child range is spliced in with ONE root-level visit. Identical to its
  // own static frame, and ~1000× fewer collect visits than `panPlain` above.
  // THIS ROW PINS THE RETAINED CAMERA-PAN WIN: if `collect` here ever climbs
  // toward `panPlain.collect`, the fragment stopped engaging under camera motion
  // and the retained tier's headline benefit silently regressed.
  //
  // globalTransform re-pinned 1002 -> 2 with Slice 3 (WebGL2 instruction-set
  // splice): the steady frame now replays recorded flush-level batches, so the
  // player's Phase-1 transform pre-pass no longer touches the group's 1000
  // rows — only the root's own matrix and the group boundary compose. If this
  // climbs back toward 1002, the instruction tier stopped engaging and the
  // splice regressed to per-node entry replay.
  panRetained: { collect: 1, inView: 1, globalTransform: 2, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // Plain Container, 10 of the 1000 sprites moved every frame. A child move
  // content-dirties the container, busting the Slice-1 cache → full re-collect
  // (1001 visits, 1000 material keys) PLUS the extra world-transform resolutions
  // the moved sprites' invalidation cascade forces (gt 8022 vs the 6001 of a
  // pure pan). Pins the dirty-path shape: the early-out-epoch dirty-walk rework
  // is expected to cut `collect`/`globalTransform` here — update deliberately.
  mutate10: { collect: 1001, inView: 1001, globalTransform: 8022, materialKey: 1000, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },
} as const;

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

/** `count` sprites of one shared texture, scattered to stay inside the 1280×720 view. */
const populate = (root: Container, count: number): Sprite[] => {
  const [texture] = makeTextures(1);
  const sprites: Sprite[] = [];

  for (let i = 0; i < count; i++) {
    const sprite = new Sprite(texture);

    sprite.setPosition((i * 137) % 1216, (i * 251) % 656);
    root.addChild(sprite);
    sprites.push(sprite);
  }

  return sprites;
};

/** Assert every field of `actual` equals the pinned `expected` row (exact shape). */
const expectCounters = (actual: FrameCounters, expected: (typeof EXPECTED)[keyof typeof EXPECTED]): void => {
  expect(actual.collect).toBe(expected.collect);
  expect(actual.inView).toBe(expected.inView);
  expect(actual.globalTransform).toBe(expected.globalTransform);
  expect(actual.materialKey).toBe(expected.materialKey);
  expect(actual.submittedNodes).toBe(expected.submittedNodes);
  expect(actual.culledNodes).toBe(expected.culledNodes);
  expect(actual.drawCalls).toBe(expected.drawCalls);
  expect(actual.batches).toBe(expected.batches);
};

describe('CPU collect-path shape gate', () => {
  it('static plain container: steady-state fast path visits the root once (O(1))', () => {
    withHarness(harness => {
      const root = new Container();

      populate(root, SPRITE_COUNT);
      // A rising `collect`/`materialKey` here means the Slice-1 per-Container
      // retained cache stopped engaging on a fully static frame — the collect
      // walk regressed from an O(1) splice back toward touching every child.
      expectCounters(measureFrameCounters(harness, root), EXPECTED.staticPlain);
      root.destroy();
    });
  });

  it('camera-pan plain container: cache busts → full O(n) re-collect', () => {
    withHarness(harness => {
      const root = new Container();

      populate(root, SPRITE_COUNT);
      const pan = (): void => void harness.view.move(1, 0);

      // A HIGHER `collect` than 1001 (≈ 1 + SPRITE_COUNT) means the walk now
      // visits more than every node once per pan — a super-linear collect
      // regression, precisely the CPU-only class the allocation gate misses.
      expectCounters(measureFrameCounters(harness, root, { beforeFrame: pan }), EXPECTED.panPlain);
      root.destroy();
    });
  });

  it('camera-pan RetainedContainer: view-independent fragment splices in one visit', () => {
    withHarness(harness => {
      const root = new RetainedContainer();

      populate(root, SPRITE_COUNT);
      const pan = (): void => void harness.view.move(1, 0);

      const actual = measureFrameCounters(harness, root, { beforeFrame: pan });

      expectCounters(actual, EXPECTED.panRetained);
      // Make the retained WIN load-bearing, not just incidental: under identical
      // camera motion the retained tier must visit dramatically fewer nodes than
      // the plain container. If this inverts, the fragment stopped engaging.
      expect(actual.collect).toBeLessThan(EXPECTED.panPlain.collect);
      root.destroy();
    });
  });

  it('mutating 10 of 1000 sprites: dirty path re-collects the container', () => {
    withHarness(harness => {
      const root = new Container();
      const sprites = populate(root, SPRITE_COUNT);
      let frame = 0;
      const mutate = (): void => {
        frame++;
        // Toggle 10 sprites between two positions so they are dirty every frame.
        for (let i = 0; i < 10; i++) {
          sprites[i]!.setPosition((i * 137) % 1216, ((i * 251) % 656) + (frame % 2));
        }
      };

      // Pins the dirty-path cost. The early-out-epoch dirty-walk rework is
      // expected to LOWER collect/globalTransform here; update EXPECTED.mutate10
      // deliberately when it lands and confirm the drop is what you intended.
      expectCounters(measureFrameCounters(harness, root, { beforeFrame: mutate }), EXPECTED.mutate10);

      for (const sprite of sprites) sprite.destroy();
    });
  });
});
