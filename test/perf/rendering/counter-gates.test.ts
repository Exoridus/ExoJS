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
 *          inView   = SceneNode._inCullRectUsingBounds calls (cull checks)
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

  // Plain Container with the camera panning one pixel every frame. Re-pinned
  // from a full re-collect (collect 1001 / inView 1001 / gt 6002 / mk 1000) to
  // the static row exactly: the capture now culls against the view grown by a
  // margin and stays valid for every view still inside that rect, so a slow pan
  // is absorbed and the frame replays. This row is the headline of the capture
  // margin — if it climbs back toward 1001, the margin stopped engaging and
  // every scrolling scene regressed to a per-frame rebuild.
  panPlain: { collect: 1, inView: 1, globalTransform: 2, materialKey: 0, submittedNodes: 1000, culledNodes: 0, drawCalls: 1, batches: 1 },

  // The same scene panned FAR ENOUGH each frame to leave the capture margin, so
  // the product expires every frame. It is the counterweight to `panPlain`:
  // without it, a margin so wide it never expired would look identical to a
  // correct one.
  //
  // `collect` re-pinned 1001 -> 1 when the persistent source landed: the frame
  // no longer walks the scene graph to find its content, it selects from the
  // items a single earlier walk discovered. That is the entire point of the
  // tier, and a `collect` back at 1001 means the source stopped engaging under a
  // moving camera.
  //
  // Every OTHER column is deliberately unchanged, and the three that matter are
  // load-bearing rather than incidental:
  //
  // - `inView` stays 1001 because the selection still asks the cull question
  //   once per item, through the node's own rule rather than a second copy of
  //   it — only the bounds it feeds that rule changed source.
  // - `culledNodes` stays 112, so a strategy that silently stopped culling and
  //   submitted the whole subtree could not pass this row.
  // - `materialKey` stays 888, because a selection resolves it live for exactly
  //   the admitted items, as the walk did.
  //
  // `globalTransform` re-pins 5554 -> 1778 with the same change: nothing in the
  // subtree moved since the items were discovered, so the stored world AABBs
  // answer both questions a `getBounds()` call used to be made for — the cull
  // test, and the screen extent the emitted command carries — and that call
  // resolves the whole parent chain. A rise back toward 5554 means the
  // stored-bounds path stopped engaging on a settled scene.
  panPlainBeyondMargin: {
    collect: 1,
    inView: 1001,
    globalTransform: 1778,
    materialKey: 888,
    submittedNodes: 888,
    culledNodes: 112,
    drawCalls: 1,
    batches: 1,
  },

  // The frame that BUILDS the source: the second consecutive rebuild over
  // unchanged content, driven by the same beyond-margin pan with a single warmup
  // frame in front of it.
  //
  // It pins the one-time cost the tier trades against, so it can never be
  // silently inflated. `collect` is 1001: the discovery walk visits every node
  // exactly once, because an item that is off-screen now is precisely the one
  // that must be findable when it scrolls in.
  //
  // `globalTransform` is 4002 — HALF what the plain re-collect this frame
  // replaced paid (8002). Discovery reads each drawable's bounds once, and the
  // selection that immediately follows it reuses those stored values instead of
  // asking the node again, so even the frame that pays for the walk comes out
  // ahead on transform resolves.
  //
  // What must NOT appear here is a per-node frame-local product. The discovery
  // walk allocates no pooled draw command, no `nodeIndex`, no transform-buffer
  // row and no backend-bound material key for a node it only discovered; at a
  // million nodes that would be roughly 48MB of rows in a grow-only buffer for
  // draws that never happen.
  sourceDiscovery: {
    collect: 1001,
    inView: 1001,
    globalTransform: 4002,
    materialKey: 1000,
    submittedNodes: 1000,
    culledNodes: 0,
    drawCalls: 1,
    batches: 1,
  },

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

/**
 * A pan that leaves the capture margin on every frame, alternating direction so
 * the scene stays in front of the camera — the row is about what the frame does
 * with its content, not about an empty view.
 */
const beyondMarginPan = (harness: WebGl2Harness): (() => void) => {
  let direction = 1;

  return () => {
    harness.view.move(200 * direction, 0);
    direction = -direction;
  };
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

  it('camera-pan plain container: the capture margin absorbs the pan and the frame replays', () => {
    withHarness(harness => {
      const root = new Container();

      populate(root, SPRITE_COUNT);
      const pan = (): void => void harness.view.move(1, 0);

      // A RISING `collect` here means the captured cull rect stopped covering
      // the panned view — the margin is the only thing keeping this frame off
      // the O(n) path below.
      expectCounters(measureFrameCounters(harness, root, { beforeFrame: pan }), EXPECTED.panPlain);
      root.destroy();
    });
  });

  it('camera-pan past the capture margin: the product expires and the frame selects from the source', () => {
    withHarness(harness => {
      const root = new Container();

      populate(root, SPRITE_COUNT);
      // 200px per frame against a 1280-wide view is past the margin on every
      // frame; alternating the direction keeps the scene in front of the camera
      // so the row stays about the collect walk, not about an empty view.
      const actual = measureFrameCounters(harness, root, { beforeFrame: beyondMarginPan(harness) });

      // A RISING `collect` means the source stopped engaging and the frame went
      // back to finding its content by walking the scene graph. A FALLING
      // `inView`/`culledNodes` means it stopped culling per item, which would
      // buy time by drawing what the camera cannot see.
      expectCounters(actual, EXPECTED.panPlainBeyondMargin);
      root.destroy();
    });
  });

  it('the source is built by one honest O(n) walk that allocates no frame-local rows', () => {
    withHarness(harness => {
      const root = new Container();

      populate(root, SPRITE_COUNT);
      // One warmup frame in front of the measured one, so the measured frame is
      // the SECOND rebuild over unchanged content — the one the build gate arms
      // discovery on.
      const actual = measureFrameCounters(harness, root, { beforeFrame: beyondMarginPan(harness), warmup: 1 });

      expectCounters(actual, EXPECTED.sourceDiscovery);
      // The walk is the price of every later selection, so it has to stay a
      // single visit per node. Anything above that is a super-linear discovery
      // regression — exactly the CPU-only class the allocation gate misses.
      expect(actual.collect).toBe(SPRITE_COUNT + 1);
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
      // Make the retained WIN load-bearing, not just incidental: the fragment is
      // captured view-INDEPENDENTLY, so it survives camera motion of any size
      // without ever revisiting the scene graph. Anchored against the DISCOVERY
      // row rather than the beyond-margin one, which now also visits the root
      // once — the group tier's claim is that it never pays a walk at all, and
      // that is what inverting here would disprove.
      expect(actual.collect).toBeLessThan(EXPECTED.sourceDiscovery.collect);
      expect(actual.inView).toBeLessThan(EXPECTED.sourceDiscovery.inView);
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
