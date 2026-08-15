/**
 * The archetype catalog the render-plan **allocation** gate measures.
 *
 * Shared by the CI gate (`allocation.test.ts`) and the standalone launcher
 * (`run-allocation.ts`) so both report the same scenes under the same names —
 * previously each kept its own inline copy and they had drifted apart.
 *
 * ── What earns a place here ────────────────────────────────────────────────
 * An archetype belongs in the gate only if it satisfies all four:
 *   1. It reaches a plan/backend path no other archetype reaches, so a
 *      regression there cannot hide behind a scene that already passes.
 *   2. It is deterministic — no randomness, no wall-clock, no GPU. Every
 *      per-frame mutation is a pure function of the frame index.
 *   3. Its median is reproducible: window-to-window and pass-to-pass spread
 *      small enough that a budget can sit close to the baseline without
 *      flaking (see the measured variance table in `allocation.test.ts`).
 *   4. It is cheap. The whole gate is part of the default `pnpm test` lane, so
 *      an archetype that needs a six-figure node count to say anything belongs
 *      in the standalone launcher's reference stage instead, not here.
 *
 * `scenarios.ts` (the wall-clock structural sweep) is a different catalog on
 * purpose: it is a cross-product built for coverage breadth, whereas this list
 * is hand-picked, budgeted, and ordered — the gate's baselines are measured
 * in this order, because in-suite JIT tier state depends on what ran before.
 *
 * @internal Test/perf-only.
 */
import type { RenderNode } from '#rendering/RenderNode';
import type { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes } from '#rendering/types';

import { buildFilteredScene, buildMeshScene, buildNestedScene, buildSpriteScene, makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';

/** Viewport the gate renders through — matches the harness default. */
const VIEW = { w: 1280, h: 720 } as const;

/** Fixed-function blend modes only: `>= BlendModes.Darken` takes the backdrop-aware shader path, a different archetype entirely. */
const FIXED_FUNCTION_BLENDS = [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply] as const;

export interface AllocationScene {
  readonly root: RenderNode;
  /** Per-frame mutation, run inside the sampled loop. Must be a pure function of the frame index. */
  readonly beforeFrame?: () => void;
  readonly teardown?: () => void;
}

export interface AllocationArchetype {
  /** Gate label, also the key into the baseline table. */
  readonly id: string;
  /** Why this archetype exists — the path it reaches that the others do not. */
  readonly rationale: string;
  /**
   * Warm-up frames before sampling starts, when the sampler's default (30) is
   * not enough. Raised ONLY where the measured window series is non-stationary,
   * and only to the value at which it settles — never as a blanket "more is
   * safer", because warm-up frames are the harness's dominant cost.
   *
   * The scenes that need it are the light ones (a few KB/frame): their rate is
   * still falling as V8 tiers up the plan walk, so a 5-window median taken at
   * the default sits ON the transient and shifts with whatever ran before. At
   * 1500 frames the series is flat and the median reproduces to ~2% pass to
   * pass. `scrolling-world` is the one that moves the other way — it reads
   * ~6 KB/frame while cold and ~21 once settled — which is exactly why it is
   * measured after the transient rather than through it.
   *
   * Heavy scenes (`moving`, `mesh`, `filtered`, `blend/… alternating`) are
   * already stationary at the default to within ±0.6%, and raising their
   * warm-up would cost minutes for no gain.
   */
  readonly warmup?: number;
  build(harness: WebGl2Harness): AllocationScene;
}

/** Warm-up frame count at which the light scenes' window series measurably flattens. */
const SETTLED_WARMUP = 1500;

/**
 * Nudge `count` sprites by ±1px on x, flipping direction every frame so the
 * scene never drifts out of view over a long sampling window. `stride` picks
 * every n-th sprite, which is how a "transform-only k of N" archetype is
 * expressed without allocating a selection array per frame.
 */
const nudgeEveryNth = (sprites: readonly Sprite[], stride: number): (() => void) => {
  let frame = 0;

  return (): void => {
    frame++;

    const dx = frame % 2 === 0 ? 1 : -1;

    for (let i = 0; i < sprites.length; i += stride) {
      const sprite = sprites[i]!;
      sprite.setPosition(sprite.position.x + dx, sprite.position.y);
    }
  };
};

/**
 * Ping-pong the camera across a world wider than the view. Ping-pong rather
 * than wrap: a modulo wrap teleports the camera once per cycle, and that single
 * frame invalidates every view-dependent cached product at once — a spike the
 * median would then have to absorb. A ping-pong only reverses direction.
 */
const pingPongCamera = (harness: WebGl2Harness, worldW: number, worldH: number, speed: number): (() => void) => {
  const spanX = Math.max(1, worldW - VIEW.w);
  const spanY = Math.max(1, worldH - VIEW.h);
  const period = spanX * 2;
  let frame = 0;

  return (): void => {
    frame++;

    const t = (frame * speed) % period;
    const offset = t <= spanX ? t : period - t;

    harness.view.setCenter(VIEW.w / 2 + offset, VIEW.h / 2 + (offset / spanX) * spanY);
  };
};

/**
 * The gate archetypes, in measurement order. Order is load-bearing: the
 * documented baselines are the medians THIS sequence produces, and a scene's
 * median shifts a few percent if the JIT arrives at it in a different tier
 * state (the `moving` scene measures ~5% higher in-suite than in isolation).
 */
export const ALLOCATION_ARCHETYPES: readonly AllocationArchetype[] = [
  {
    id: 'empty',
    rationale: 'Harness + sampler floor. Not a ratcheted budget — a fixed roomy floor that only a gross regression can cross.',
    build: () => {
      const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/1000 static',
    rationale: 'Steady state, nothing dirty: the fully-retained replay path. Any per-frame allocation that survives here is pure waste.',
    build: () => {
      const { root } = buildSpriteScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/1000 moving',
    rationale: 'Every transform dirty every frame — the full transform re-upload path, the worst case for the row-patch machinery.',
    build: () => {
      const { root, sprites } = buildSpriteScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, beforeFrame: nudgeEveryNth(sprites, 1), teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/10000 transform-only 1%',
    rationale:
      'The shape a real game frame has: a large mostly-static scene with a small moving subset. Reaches the sparse row-patch path — ' +
      'a regression that makes patching scale with N instead of k is invisible to `sprite/1000 moving` (where k = N) and to `static` (where k = 0).',
    build: () => {
      const { root, sprites } = buildSpriteScene({ count: 10000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, beforeFrame: nudgeEveryNth(sprites, 100), teardown: () => root.destroy() };
    },
  },
  {
    id: 'nested/1000 d4',
    rationale: 'Many Group scopes, all clean: per-scope plan playback in the retained steady state.',
    build: () => {
      const { root } = buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'deep-hierarchy/1000 d16 1%',
    rationale:
      'Depth 16 with a 1% moving subset: the ancestor-walk invalidation path. Each moved leaf dirties 16 ancestors, so a per-ancestor ' +
      'allocation (the class of bug the `moving` baseline was ratcheted for) shows up here at 16x the amplitude — and `nested/1000 d4` ' +
      'cannot see it at all, because nothing there is ever dirty.',
    warmup: SETTLED_WARMUP,
    build: () => {
      const { root, sprites } = buildNestedScene({ count: 1000, perContainer: 8, depth: 16, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, beforeFrame: nudgeEveryNth(sprites, 100), teardown: () => root.destroy() };
    },
  },
  {
    id: 'mesh/1000',
    rationale: 'Per-drawable mesh draws — the mesh renderer syncs a second per-instance DataTexture (tint) alongside transform every frame.',
    build: () => {
      const { root } = buildMeshScene({ count: 1000, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'filtered/100',
    rationale: 'A Barrier scope + child plan per sprite — the effect-node path, and the heaviest allocator in the catalog.',
    build: () => {
      const { root } = buildFilteredScene({ count: 100, textures: makeTextures(1), viewW: VIEW.w, viewH: VIEW.h });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'blend/1000 plateau64',
    rationale: 'Four fixed-function blend modes in runs of 64 — a realistic ~16 flush boundaries per frame. Measures batch-record allocation per BATCH.',
    warmup: SETTLED_WARMUP,
    build: () => {
      const { root } = buildSpriteScene({
        count: 1000,
        textures: makeTextures(1),
        blendModes: FIXED_FUNCTION_BLENDS,
        blendRunLength: 64,
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'blend/1000 alternating',
    rationale:
      'The same four blend modes alternating per sprite — one flush per sprite, ~1000 batches per frame. Deliberately pathological: paired ' +
      'with `plateau64` it brackets the batch-record path, and the pair is what makes a per-batch allocation regression legible (plateau64 ' +
      'alone would dilute it 64x).',
    build: () => {
      const { root } = buildSpriteScene({
        count: 1000,
        textures: makeTextures(1),
        blendModes: FIXED_FUNCTION_BLENDS,
        viewW: VIEW.w,
        viewH: VIEW.h,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
];

/**
 * Measured and reported, but deliberately NOT gated — they fail criterion 3
 * above. Kept here so the standalone launcher still covers them and so the
 * reason they are ungated is recorded next to the scene rather than lost.
 */
export const ALLOCATION_REPORT_ONLY: readonly AllocationArchetype[] = [
  {
    id: 'scrolling-world/10000',
    rationale:
      'The only archetype with a MOVING CAMERA and genuine off-screen content: 10k sprites over 4x the viewport area, ~25% visible, camera ' +
      'ping-ponging 8 units/frame. Coverage the gate genuinely lacks — but NOT GATEABLE IN-SUITE, and the reason is now measured rather than ' +
      'inferred. Rendered in a process of its own it is the best-behaved scene in the catalog: ~1.65 KB/frame, 4.5% spread over five fresh ' +
      'processes. Rendered as the eleventh scene of the gate it reads 14.6 or 19.8 KB/frame — the same ~25% bimodality first seen across ' +
      'fresh vitest processes, with every window inside a run agreeing to ±2%, and no budget can sit between those two clusters. What moves ' +
      'is V8 settling the hot cull/selection loop into one escape-analysis state for the life of the process, and ten scenes of prior tier-up ' +
      'state decide which. So it stays out of the same-process gate; `run-allocation-cell.ts` is where its number is real.',
    warmup: SETTLED_WARMUP,
    build: harness => {
      const worldW = VIEW.w * 2;
      const worldH = VIEW.h * 2;
      const { root } = buildSpriteScene({ count: 10000, textures: makeTextures(1), viewW: worldW, viewH: worldH });

      harness.view.reset(VIEW.w / 2, VIEW.h / 2, VIEW.w, VIEW.h);

      return { root, beforeFrame: pingPongCamera(harness, worldW, worldH, 8), teardown: () => root.destroy() };
    },
  },
];

/**
 * A 1M-sprite scrolling world — the count stage the audit asked for, kept OUT
 * of the gate on purpose. One reading at this size costs orders more than the
 * whole rest of the catalog, which is the wrong trade for a lane every
 * contributor PR runs. Exposed here so the standalone launcher can offer it as
 * an explicit manual/reference mode (`pnpm perf:renderers:alloc --reference`),
 * where the number is read by a human rather than gated.
 *
 * At this size the scene's START-UP allocation is not a warm-up detail that a
 * few dozen frames absorb — it dominates any short window (frame 1 alone runs
 * into hundreds of MB, and the persistent source + spatial index are still
 * being built dozens of frames in). The launcher therefore measures this scene
 * in two phases and reports the bootstrap total and the steady-state rate
 * separately; see `runReference` in `run-allocation.ts`.
 */
export const buildScrollingWorldReference = (harness: WebGl2Harness, count: number): AllocationScene => {
  const worldW = VIEW.w * 2;
  const worldH = VIEW.h * 2;
  const { root } = buildSpriteScene({ count, textures: makeTextures(1), viewW: worldW, viewH: worldH });

  harness.view.reset(VIEW.w / 2, VIEW.h / 2, VIEW.w, VIEW.h);

  return { root, beforeFrame: pingPongCamera(harness, worldW, worldH, 8), teardown: () => root.destroy() };
};
