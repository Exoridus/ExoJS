/**
 * Filter / effect allocation probe catalog.
 *
 * Deliberately NOT part of `ALLOCATION_ARCHETYPES`: that list's documented
 * baselines are the medians ITS order produces, so appending to it would
 * invalidate every number in the gate. These scenes answer a different
 * question - how filter allocation SCALES - and are driven one-per-process by
 * `run-allocation-cell.ts`.
 *
 * ── Why a matrix and not a coverage list ──────────────────────────────────
 * `filtered/100` reads ~295 KB/frame against a ~1 KB floor for every other
 * gated scene, and "≈3 KB per filtered sprite" does not say WHICH unit of work
 * costs it. Three units are stacked inside a filtered node and each one is a
 * different fix if it turns out to dominate:
 *
 *   BARRIER      the plan-side entry: an effect descriptor, a barrier scope, a
 *                child plan, and a collect walk that cannot use the retained
 *                tier. `clip/N` isolates it - a rect clip is a barrier with NO
 *                offscreen target and NO filter pass.
 *   TARGET       the offscreen capture: acquire, a `BackendTargetPass`, a
 *                render-to-texture round trip, release. `mask/N` isolates it -
 *                an alpha mask takes two targets and composites, with no
 *                `Filter.apply` anywhere.
 *   FILTER PASS  `Filter.apply` itself, once per filter in the chain.
 *                `color/N` is one, `stack2` / `stack3` are two and three over
 *                the same barrier and the same first target.
 *
 * Read down the family and the per-unit cost falls out by subtraction; read
 * across `color/{1,10,100,200}` and the fixed-vs-per-node split does.
 *
 * The remaining families cover the shapes a fix must not regress rather than
 * the scaling law: `blur-q{1,3}` varies DRAWS per filter pass while holding the
 * pass count at one, `container/1000` puts a single filter over a large subtree
 * (the opposite extreme from `color/100`), and `container-cached/1000` is that
 * same subtree with `cacheAsTexture`, where the filter passes are supposed to
 * stop running after the bake.
 *
 * Every scene here is STATIC - no `beforeFrame`. That is the point: a static
 * filtered scene should be the cheapest frame there is, and measuring one that
 * is not is what this catalog exists for.
 *
 * @internal Test/perf-only.
 */
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';

import type { AllocationArchetype, AllocationScene } from './allocationScenes';
import { makeTextures, scatterInView } from './fixtures';

/** Viewport the probes render through - matches the harness default. */
const VIEW = { w: 1280, h: 720 } as const;

/**
 * Warm-up frames. Higher than the catalog default (30) for the same reason the
 * light gate scenes need it: the per-frame rate is still falling while V8 tiers
 * up the barrier walk, and a per-unit cost read off the transient is not the
 * per-unit cost of a steady frame. These scenes are heavy enough that 400 is
 * both settled and affordable.
 */
const WARMUP = 400;

/** `count` scattered sprites under one root, each given whatever `decorate` does to it. */
const buildDecoratedSprites = (count: number, decorate: (sprite: Sprite, index: number) => void): AllocationScene => {
  const [texture] = makeTextures(1);
  const root = new Container();

  for (let i = 0; i < count; i++) {
    const sprite = new Sprite(texture!);

    scatterInView(sprite, i, VIEW.w, VIEW.h);
    decorate(sprite, i);
    root.addChild(sprite);
  }

  return { root, teardown: () => root.destroy() };
};

/** One filtered container over `count` plain sprites - the opposite extreme from one filter per sprite. */
const buildFilteredContainer = (count: number, filters: readonly Filter[], cacheAsTexture: boolean): AllocationScene => {
  const [texture] = makeTextures(1);
  const root = new Container();
  const group = new Container();

  for (let i = 0; i < count; i++) {
    const sprite = new Sprite(texture!);

    scatterInView(sprite, i, VIEW.w, VIEW.h);
    group.addChild(sprite);
  }

  for (const filter of filters) {
    group.addFilter(filter);
  }

  group.cacheAsTexture = cacheAsTexture;
  root.addChild(group);

  return { root, teardown: () => root.destroy() };
};

const colorFilterScene = (count: number, filtersPerNode: number): AllocationScene =>
  buildDecoratedSprites(count, sprite => {
    for (let i = 0; i < filtersPerNode; i++) {
      sprite.addFilter(new ColorMatrixFilter());
    }
  });

/**
 * The probe catalog. Unlike `ALLOCATION_ARCHETYPES` the ORDER carries no
 * meaning - every entry is measured in its own process.
 */
export const FILTER_ARCHETYPES: readonly AllocationArchetype[] = [
  // ── BARRIER only: a rect clip takes the barrier path with no target ──────
  {
    id: 'filter/clip 100',
    rationale: 'Rect-clip barrier: barrier entry + child plan + scissor, no offscreen target, no Filter.apply. The barrier floor.',
    warmup: WARMUP,
    build: () =>
      buildDecoratedSprites(100, sprite => {
        sprite.clip = true;
      }),
  },

  // ── BARRIER + TARGET: an alpha mask composites, never calls a filter ─────
  {
    id: 'filter/mask 100',
    rationale: 'Alpha-mask barrier: two acquired targets and a composite per node, with no Filter.apply. Isolates target cost from filter cost.',
    warmup: WARMUP,
    build: () => {
      const [texture] = makeTextures(1);

      return buildDecoratedSprites(100, sprite => {
        const maskNode = new Sprite(texture!);

        maskNode.setPosition(sprite.position.x, sprite.position.y);
        sprite.mask = maskNode;
      });
    },
  },

  // ── FILTERED NODE COUNT: fixed cost vs per-node cost ─────────────────────
  {
    id: 'filter/color 1',
    rationale: 'One filtered sprite. With the 10/100/200 rows this separates the per-frame fixed cost from the per-node cost.',
    warmup: WARMUP,
    build: () => colorFilterScene(1, 1),
  },
  {
    id: 'filter/color 10',
    rationale: 'Ten filtered sprites — the low end of the scaling series.',
    warmup: WARMUP,
    build: () => colorFilterScene(10, 1),
  },
  {
    id: 'filter/color 100',
    rationale: "The gate's `filtered/100`, rebuilt here so the whole series is measured by one runner under one warm-up.",
    warmup: WARMUP,
    build: () => colorFilterScene(100, 1),
  },
  {
    id: 'filter/color 200',
    rationale: 'Doubles the node count. Confirms (or breaks) linearity in filtered nodes before anything is attributed per node.',
    warmup: WARMUP,
    build: () => colorFilterScene(200, 1),
  },

  // ── FILTER PASSES per node: same barrier, same first target ──────────────
  {
    id: 'filter/stack2 100',
    rationale: 'Two filters per node: one more Filter.apply and one more intermediate target, same barrier and same capture.',
    warmup: WARMUP,
    build: () => colorFilterScene(100, 2),
  },
  {
    id: 'filter/stack3 100',
    rationale: 'Three filters per node. With stack2 and color/100 this gives the marginal cost of a filter pass directly.',
    warmup: WARMUP,
    build: () => colorFilterScene(100, 3),
  },

  // ── DRAWS per filter pass: pass count held at one ────────────────────────
  {
    id: 'filter/blur-q1 100',
    rationale: 'BlurFilter quality 1 — one pass, six draws. Varies draws per pass while the pass and target counts match color/100.',
    warmup: WARMUP,
    build: () =>
      buildDecoratedSprites(100, sprite => {
        sprite.addFilter(new BlurFilter({ radius: 2, quality: 1 }));
      }),
  },
  {
    id: 'filter/blur-q3 100',
    rationale: 'BlurFilter quality 3 — one pass, fourteen draws. If cost tracks draws rather than passes, this row says so.',
    warmup: WARMUP,
    build: () =>
      buildDecoratedSprites(100, sprite => {
        sprite.addFilter(new BlurFilter({ radius: 4, quality: 3 }));
      }),
  },

  // ── The retained capture's cull margin ───────────────────────────────────
  // Filtered sprites parked OUTSIDE the view but inside the inflated capture
  // rect (`RETAINED_CULL_MARGIN_RATIO` = 1/16, so 80 px horizontally on a
  // 1280-wide view). A capturing collect admits them, so their barriers run and
  // their composites are issued - while the enclosing frame never shows them.
  // This is the one place where "the effect path only draws what it already
  // decided to draw" is not obviously true, so it is measured rather than
  // argued: the structural counters here must not move.
  {
    id: 'filter/color 100 margin',
    rationale: 'Filtered nodes inside the capture cull margin but outside the view — the case where a composite draw is collected but not visible.',
    warmup: WARMUP,
    build: () => {
      const [texture] = makeTextures(1);
      const root = new Container();

      // Half in view, half in the margin. A root whose whole subtree sits
      // outside is culled at the root and never reaches the barrier path at
      // all, so the visible half is what keeps the root - and the capture -
      // alive for the other half to be admitted by the inflated rect.
      for (let i = 0; i < 100; i++) {
        const sprite = new Sprite(texture!);

        if (i % 2 === 0) {
          scatterInView(sprite, i, VIEW.w, VIEW.h);
        } else {
          // x beyond the view's right edge, still well inside the +80 px margin.
          sprite.setPosition(VIEW.w + 1 + (i % 15), (i * 251) % (VIEW.h - 64));
        }

        sprite.addFilter(new ColorMatrixFilter());
        root.addChild(sprite);
      }

      return { root, teardown: () => root.destroy() };
    },
  },

  // ── ONE filter over a large subtree ──────────────────────────────────────
  {
    id: 'filter/container 1000',
    rationale: 'One filter over a 1000-sprite subtree: one barrier, one target, one filter pass, a thousand drawables.',
    warmup: WARMUP,
    build: () => buildFilteredContainer(1000, [new ColorMatrixFilter()], false),
  },
  {
    id: 'filter/container-cached 1000',
    rationale: 'The same subtree with cacheAsTexture. After the bake the filter pass should not run per frame at all — verifies that it does not.',
    warmup: WARMUP,
    build: () => buildFilteredContainer(1000, [new ColorMatrixFilter()], true),
  },
];

/** Baseline for the series: the same sprites with no effect of any kind. */
export const FILTER_REFERENCE: readonly AllocationArchetype[] = [
  {
    id: 'filter/none 100',
    rationale: 'The color/100 scene with the filters removed — the retained-tier floor the filtered rows are measured against.',
    warmup: WARMUP,
    build: () => colorFilterScene(100, 0),
  },
  {
    id: 'filter/none 1000',
    rationale: 'The container/1000 subtree with no filter — the floor for the container rows.',
    warmup: WARMUP,
    build: () => buildFilteredContainer(1000, [], false),
  },
];

/** Every probe scene, by id. */
export const ALL_FILTER_ARCHETYPES: readonly AllocationArchetype[] = [...FILTER_REFERENCE, ...FILTER_ARCHETYPES];

/** Node count a scene's per-node numbers should be divided by (filtered/masked/clipped nodes, not drawables). */
export const FILTERED_NODE_COUNT: Readonly<Record<string, number>> = {
  'filter/none 100': 0,
  'filter/none 1000': 0,
  'filter/clip 100': 100,
  'filter/mask 100': 100,
  'filter/color 1': 1,
  'filter/color 10': 10,
  'filter/color 100': 100,
  'filter/color 200': 200,
  'filter/color 100 margin': 100,
  'filter/stack2 100': 100,
  'filter/stack3 100': 100,
  'filter/blur-q1 100': 100,
  'filter/blur-q3 100': 100,
  'filter/container 1000': 1,
  'filter/container-cached 1000': 1,
};

/** Root node of a scene, for callers that need it without rebuilding. */
export type FilterSceneRoot = RenderNode;
