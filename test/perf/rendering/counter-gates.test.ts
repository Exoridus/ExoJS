/**
 * CPU collect-path SHAPE gate. Deterministic, GPU-free, machine-independent.
 *
 * The allocation gate (`allocation.test.ts`) only catches regressions that
 * ALLOCATE. A CPU regression that walks twice as many nodes per frame without
 * allocating — exactly the class of change a collect-path rework can
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
 * Parallel rendering workstreams may change the dirty-walk (early-out
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
  // Plain Container, nothing changes frame-to-frame. The automatic render-root
  // representation is fully engaged: the root is visited once and the frame
  // replays recorded flush-level batches — zero child _collect, zero cull, zero
  // material-key work. This is the O(1)-visit steady state.
  //
  // globalTransform re-pinned 2001 -> 2 when the render root became retained by
  // default: the frame no longer runs the player's Phase-1 transform pre-pass
  // over the 1000 rows, only the root's own matrix resolves. If this climbs back
  // toward 2001, the root's instruction tier stopped engaging on a static frame.
  staticPlain: { collect: 1, inView: 1, globalTransform: 2, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // Plain Container with the camera panning every frame. A pan changes which
  // nodes pass the view test, so the frame takes a FULL re-collect: 1 root +
  // 1000 children visited, 1001 cull checks, 1000 material keys. This is the
  // O(n) collect cost — the row that catches "the collect walk regressed to
  // touch every node again". A LOWER number here is an improvement; a HIGHER one
  // (e.g. 2× the visits) is the exact CPU regression that merges silently.
  //
  // The root representation does NOT save this frame: its view-reuse test asks
  // whether every kept node's cull rect still lies inside the new view rect, and
  // a scene filling the viewport fails that after a single pixel of pan. Closing
  // it needs a captured, inflated cull rect — recorded as `NEU-O45`. Until then
  // this row stays the honest O(n) cost of a panning camera.
  //
  // globalTransform re-pinned 6001 -> 6002: the root resolves its own global
  // transform once per build, to observe ancestry-derived moves its revisions do
  // not see.
  panPlain: { collect: 1001, inView: 1001, globalTransform: 6002, materialKey: 1000, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // RetainedContainer with the camera panning every frame. The retained fragment
  // is captured view-independently (deliberately omits View.updateId
  // and the group's own transform from the key), so a pan does NOT bust it — the
  // whole child range is spliced in with ONE root-level visit. Identical to its
  // own static frame, and ~1000× fewer collect visits than `panPlain` above.
  // THIS ROW PINS THE RETAINED CAMERA-PAN WIN: if `collect` here ever climbs
  // toward `panPlain.collect`, the fragment stopped engaging under camera motion
  // and the retained tier's headline benefit silently regressed.
  //
  // globalTransform re-pinned 1002 -> 2 once the WebGL2 instruction-set
  // splice landed: the steady frame now replays recorded flush-level batches, so the
  // player's Phase-1 transform pre-pass no longer touches the group's 1000
  // rows — only the root's own matrix and the group boundary compose. If this
  // climbs back toward 1002, the instruction tier stopped engaging and the
  // splice regressed to per-node entry replay.
  panRetained: { collect: 1, inView: 1, globalTransform: 2, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // Plain Container, 10 of the 1000 sprites moved every frame. A transform-only
  // move no longer throws the frame away: the moved rows are patched in place and
  // the recorded batches still splice, so the walk stays at ONE visit.
  //
  // Re-pinned from collect 1001 / inView 1001 / gt 8022 / mk 1000, which was the
  // full re-collect this frame used to pay. The residual globalTransform (2082 vs
  // the static row's 2) is the reconcile itself: each moved node resolves its own
  // matrix for the patched row plus the bounds refresh, and the invalidation
  // cascade resolves a few ancestors — O(k), not O(n). If `collect` climbs back
  // toward 1001, the row patch stopped engaging and every moving scene regressed
  // to a full rebuild.
  mutate10: { collect: 1, inView: 1, globalTransform: 2082, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },
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
      // A rising `collect`/`materialKey` here means the per-Container
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

  it('mutating 10 of 1000 sprites: the row patch keeps the frame on the recorded tier', () => {
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

      // Pins the O(k) reconcile: a transform-only move patches its baked row
      // instead of invalidating, so the walk must stay at one visit no matter how
      // many of the 1000 sprites move. A `collect` back at 1001 means the patch
      // path stopped engaging.
      expectCounters(measureFrameCounters(harness, root, { beforeFrame: mutate }), EXPECTED.mutate10);

      for (const sprite of sprites) sprite.destroy();
    });
  });
});
