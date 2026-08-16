/**
 * Retained capture-margin probe: the `scrolling-world` scene, a configurable
 * capture margin, and per-frame retention-tier accounting.
 *
 * Three pieces, none of which exist in the engine:
 *
 * - **The scene.** A faithful re-implementation of the `scrolling-world`
 *   archetype from `@codexo/exojs-bench` (`src/rendering/archetypes.ts`,
 *   `src/rendering/world.ts`, `src/rendering/adapters/exojs.ts`): a nesting-4
 *   container spine, leaves on a near-square grid over `worldSpan` viewports per
 *   axis, culling on, and a camera travelling the world diagonal at a fixed
 *   speed and reflecting off the world edges. Re-implemented rather than
 *   imported because the bench package sits outside the workspace typecheck and
 *   its adapters reach competitor libraries; the geometry is pure arithmetic and
 *   is pinned against the bench's own `world.ts` by
 *   `cull-margin-probe-fidelity.test.ts`, so the copy cannot drift silently.
 * - **The margin injection.** `RETAINED_CULL_MARGIN_RATIO` is a module constant
 *   in `RenderPlanBuilder`, so a sweep over it would otherwise mean one source
 *   edit and one rebuild per point. {@link installCaptureMargin} replaces the
 *   builder's private inflation step instead, which keeps the production default
 *   untouched and every sweep point inside one process.
 * - **The tier accounting.** Which of the retention tiers served a frame is not
 *   an engine statistic. The probe wraps the four decision points and classifies
 *   each frame from what they answered, so a margin's cost can be read as
 *   "frames per capture miss" rather than inferred from a wall clock.
 *
 * @internal Test/perf-only.
 */
import type { ReadonlyRectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RetainedRootRepresentation } from '#rendering/plan/RetainedRootRepresentation';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { View } from '#rendering/View';

import { makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';

/** Fixed design-space viewport every arm of the bench initialises at. */
export const VIEWPORT_WIDTH = 1280;
/** Fixed design-space viewport every arm of the bench initialises at. */
export const VIEWPORT_HEIGHT = 720;
/** Inset that keeps every gridded leaf off the world edge. */
export const GRID_MARGIN = 32;
/** Side length of the generated leaf quads, in pixels. */
export const SPRITE_SIZE = 8;
/** `scrolling-world`'s own archetype parameters. */
export const SCROLLING_WORLD = { nestingDepth: 4, worldSpan: 2, cameraSpeed: 8 } as const;

/** Row/column layout of the leaf grid, plus the cell size derived from it. */
export interface GridLayout {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

/** Near-square grid covering `width` x `height` inset by `margin` on every side. */
export const gridLayout = (nodeCount: number, width: number, height: number, margin: number): GridLayout => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
  const rows = Math.max(1, Math.ceil(nodeCount / columns));

  return { columns, rows, cellWidth: (width - 2 * margin) / columns, cellHeight: (height - 2 * margin) / rows };
};

/** Resting position of leaf `index` on `layout`, in row-major order. */
export const gridPosition = (index: number, layout: GridLayout, margin: number): { x: number; y: number } => ({
  x: margin + (index % layout.columns) * layout.cellWidth + layout.cellWidth / 2,
  y: margin + Math.floor(index / layout.columns) * layout.cellHeight + layout.cellHeight / 2,
});

/** Triangle wave: `value` folded back and forth inside `[0, span]`. */
export const reflect = (value: number, span: number): number => {
  if (span <= 0) {
    return 0;
  }

  const period = 2 * span;
  const wrapped = ((value % period) + period) % period;

  return wrapped <= span ? wrapped : period - wrapped;
};

/**
 * Camera centre for `frame`, as a closed form in the frame index. The camera
 * travels the diagonal at `speed` world units per frame — equal per-axis
 * components of a unit diagonal — and reflects off the world edges.
 */
export const cameraCenterAt = (frame: number, speed: number, worldSpan: number): { x: number; y: number } => {
  const worldW = VIEWPORT_WIDTH * worldSpan;
  const worldH = VIEWPORT_HEIGHT * worldSpan;
  const travel = frame * speed * Math.SQRT1_2;

  return {
    x: VIEWPORT_WIDTH / 2 + reflect(travel, worldW - VIEWPORT_WIDTH),
    y: VIEWPORT_HEIGHT / 2 + reflect(travel, worldH - VIEWPORT_HEIGHT),
  };
};

/** Leaves whose quad intersects the view rect at `frame` — the on-screen count. */
export const visibleLeafCount = (nodeCount: number, frame: number, speed: number, worldSpan: number): number => {
  const layout = gridLayout(nodeCount, VIEWPORT_WIDTH * worldSpan, VIEWPORT_HEIGHT * worldSpan, GRID_MARGIN);
  const centre = cameraCenterAt(frame, speed, worldSpan);
  const left = centre.x - VIEWPORT_WIDTH / 2;
  const top = centre.y - VIEWPORT_HEIGHT / 2;
  const right = left + VIEWPORT_WIDTH;
  const bottom = top + VIEWPORT_HEIGHT;

  let visible = 0;

  for (let index = 0; index < nodeCount; index++) {
    const position = gridPosition(index, layout, GRID_MARGIN);

    if (position.x < right && position.x + SPRITE_SIZE > left && position.y < bottom && position.y + SPRITE_SIZE > top) {
      visible++;
    }
  }

  return visible;
};

export interface ScrollingWorldScene {
  readonly root: RenderNode;
  /** Park the camera on the centre for `frame`. */
  step(frame: number): void;
  destroy(): void;
}

/** Build the `scrolling-world` scene against `harness` and park the camera on frame 0. */
export const buildScrollingWorld = (harness: WebGl2Harness, nodeCount: number, speed: number, worldSpan: number): ScrollingWorldScene => {
  const textures = makeTextures(1, SPRITE_SIZE);
  const root = new Container();

  root.cullable = true;

  const spine: Container[] = [root];

  for (let depth = 1; depth < SCROLLING_WORLD.nestingDepth; depth++) {
    const container = new Container();

    container.cullable = true;
    spine[depth - 1]!.addChild(container);
    spine.push(container);
  }

  const layout = gridLayout(nodeCount, VIEWPORT_WIDTH * worldSpan, VIEWPORT_HEIGHT * worldSpan, GRID_MARGIN);

  for (let i = 0; i < nodeCount; i++) {
    const leaf = new Sprite(textures[0]!);
    const cell = gridPosition(i, layout, GRID_MARGIN);

    leaf.cullable = true;
    leaf.setPosition(cell.x, cell.y);
    spine[i % spine.length]!.addChild(leaf);
  }

  const view = harness.view;
  const start = cameraCenterAt(0, speed, worldSpan);

  view.reset(start.x, start.y, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  return {
    root,
    step(frame: number): void {
      const centre = cameraCenterAt(frame, speed, worldSpan);

      view.setCenter(centre.x, centre.y);
    },
    destroy(): void {
      root.destroy();
    },
  };
};

// ── Margin injection ────────────────────────────────────────────────────────

/** Shape of the builder internals the injection reaches into. */
interface BuilderInternals {
  _captureCullRect: { set(x: number, y: number, width: number, height: number): void };
  _captureCullActive: boolean;
  _inflateCaptureCullRect(view: View): void;
}

type BuilderProto = RenderPlanBuilder & BuilderInternals;

const originalInflate = (RenderPlanBuilder.prototype as unknown as BuilderProto)._inflateCaptureCullRect;

/**
 * Make every capture and every indexed selection cull against the view grown by
 * `ratio` per side, for the rest of the process. `ratio = 0` reproduces a tight
 * view-rect cull; restoring the production constant means calling
 * {@link restoreCaptureMargin}.
 */
export const installCaptureMargin = (ratio: number): void => {
  (RenderPlanBuilder.prototype as unknown as BuilderProto)._inflateCaptureCullRect = function inflate(this: BuilderInternals, view: View): void {
    const rect = view.getBounds();
    const marginX = rect.width * ratio;
    const marginY = rect.height * ratio;

    this._captureCullRect.set(rect.x - marginX, rect.y - marginY, rect.width + 2 * marginX, rect.height + 2 * marginY);
    this._captureCullActive = true;
  };
};

/** Put the engine's own margin back. */
export const restoreCaptureMargin = (): void => {
  (RenderPlanBuilder.prototype as unknown as BuilderProto)._inflateCaptureCullRect = originalInflate;
};

/**
 * Make every backend refuse the indexed slot path for the rest of the process,
 * so a root falls to the capture / source-selection tiers instead.
 *
 * `scrolling-world` qualifies for persistent slots, and a qualifying root never
 * reaches the capture tier at all — which would leave the tier the capture
 * margin is NAMED after unmeasured. Refusing here rather than deforming the
 * scene (mixed z, a non-group sibling) keeps the two runs comparable: identical
 * geometry, identical camera, one tier apart.
 */
export const refusePersistentSlots = (backendPrototype: object): void => {
  (backendPrototype as { _acquirePersistentSlots?: unknown })._acquirePersistentSlots = (): null => null;
};

// ── Retention-tier accounting ───────────────────────────────────────────────

/**
 * Which tier served one frame. Ordered cheapest first, and named after the code
 * path rather than after the old "replay vs recollect" dichotomy, which no
 * longer describes what a margin miss costs.
 */
export interface TierCounts {
  /** Indexed tier, cached: the last selection's order stream was re-issued. */
  slotReplay: number;
  /** Indexed tier, missed: membership re-queried from the spatial index. */
  slotReselect: number;
  /** Capture tier: the recorded product was replayed. */
  captureReplay: number;
  /** Capture missed, but the persistent source still answered the frame. */
  sourceSelect: number;
  /** Neither tier held: the frame walked the scene graph. */
  fullCollect: number;
  /** Source discovery walks (one O(N) pass plus one item per drawable). */
  sourceBuild: number;
  /** Captures committed. */
  captureCommit: number;
}

/** Spatial-index query volume, summed over the measured window. */
export interface QueryTotals {
  cells: number;
  candidates: number;
  entered: number;
  exited: number;
  visible: number;
}

export interface ProbeTotals {
  readonly tiers: TierCounts;
  readonly query: QueryTotals;
  /** Frames folded in. */
  frames: number;
}

const zeroTiers = (): TierCounts => ({
  slotReplay: 0,
  slotReselect: 0,
  captureReplay: 0,
  sourceSelect: 0,
  fullCollect: 0,
  sourceBuild: 0,
  captureCommit: 0,
});

const zeroQuery = (): QueryTotals => ({ cells: 0, candidates: 0, entered: 0, exited: 0, visible: 0 });

/** Per-frame classification state, written by the wrappers below. */
interface FrameState {
  persistentServed: boolean;
  persistentCovered: boolean;
  captureClean: boolean;
  sourceSelected: boolean;
  sourceBuilt: boolean;
  captured: boolean;
}

interface PlanBuilderPrivate {
  _collectPersistentRoot(...args: never[]): boolean;
  _resolveSourceSelection(...args: never[]): unknown;
  _discoverSource(...args: never[]): unknown;
}

/**
 * Wrap the four retention decision points for the rest of the process.
 *
 * Cheap by construction: each wrapper runs once per render root per frame and
 * does one boolean write, so the accounting can stay installed while the same
 * run is timed. The alternative — a second, uninstrumented run — would compare
 * two different JIT histories, which is the exact hazard `run-allocation-cell`
 * documents for this scene.
 */
export const installTierProbe = (): ProbeTotals => {
  const totals: ProbeTotals = { tiers: zeroTiers(), query: zeroQuery(), frames: 0 };
  const state: FrameState = {
    persistentServed: false,
    persistentCovered: false,
    captureClean: false,
    sourceSelected: false,
    sourceBuilt: false,
    captured: false,
  };

  probeState = state;
  probeTotals = totals;

  const builder = RenderPlanBuilder.prototype as unknown as PlanBuilderPrivate;
  const representation = RetainedRootRepresentation.prototype;

  const collectPersistentRoot = builder._collectPersistentRoot;
  const resolveSourceSelection = builder._resolveSourceSelection;
  const discoverSource = builder._discoverSource;
  const isClean = representation.isCleanIgnoringTransform;
  const covers = representation.persistentSelectionCovers;
  const commitCapture = representation.commitCapture;

  builder._collectPersistentRoot = function collect(this: PlanBuilderPrivate, ...args: never[]): boolean {
    const served = collectPersistentRoot.apply(this, args);

    state.persistentServed = served;

    return served;
  };

  builder._resolveSourceSelection = function resolve(this: PlanBuilderPrivate, ...args: never[]): unknown {
    const selection = resolveSourceSelection.apply(this, args);

    state.sourceSelected = selection !== null;

    return selection;
  };

  builder._discoverSource = function discover(this: PlanBuilderPrivate, ...args: never[]): unknown {
    state.sourceBuilt = true;

    return discoverSource.apply(this, args);
  };

  representation.isCleanIgnoringTransform = function clean(this: RetainedRootRepresentation, ...args): boolean {
    const value = isClean.apply(this, args);

    state.captureClean = value;

    return value;
  };

  representation.persistentSelectionCovers = function covered(this: RetainedRootRepresentation, view: View): boolean {
    const value = covers.call(this, view);

    state.persistentCovered = value;

    return value;
  };

  representation.commitCapture = function commit(this: RetainedRootRepresentation, ...args): void {
    state.captured = true;

    commitCapture.apply(this, args);
  };

  return totals;
};

let probeState: FrameState | null = null;
let probeTotals: ProbeTotals | null = null;

/** Clear the per-frame classification. Call immediately before a render. */
export const beginProbeFrame = (): void => {
  if (probeState === null) {
    return;
  }

  probeState.persistentServed = false;
  probeState.persistentCovered = false;
  probeState.captureClean = false;
  probeState.sourceSelected = false;
  probeState.sourceBuilt = false;
  probeState.captured = false;
};

/** Which tier answered one frame — the return of {@link endProbeFrame}. */
export type ServedBy = 'slotReplay' | 'slotReselect' | 'captureReplay' | 'sourceSelect' | 'fullCollect';

/**
 * Fold the frame just rendered into the totals, reading the selection delta off
 * `root`'s representation for the query volume the frame actually paid, and
 * report which tier served it so a caller can bracket its timings by tier.
 */
export const endProbeFrame = (root: RenderNode): ServedBy => {
  const state = probeState;
  const totals = probeTotals;

  if (state === null || totals === null) {
    return 'fullCollect';
  }

  const tiers = totals.tiers;

  totals.frames++;

  let served: ServedBy;

  if (state.persistentServed) {
    served = state.persistentCovered ? 'slotReplay' : 'slotReselect';
  } else if (state.captureClean) {
    served = 'captureReplay';
  } else if (state.sourceSelected) {
    served = 'sourceSelect';
  } else {
    served = 'fullCollect';
  }

  tiers[served]++;

  if (state.sourceBuilt) {
    tiers.sourceBuild++;
  }

  if (state.captured) {
    tiers.captureCommit++;
  }

  // Only a frame that actually queried has a delta worth folding. Both replay
  // tiers leave the previous selection's numbers in place, so folding them
  // would count the same query once per frame it stayed valid for — which is
  // precisely the quantity the margin is supposed to reduce.
  if (served === 'slotReplay' || served === 'captureReplay') {
    return served;
  }

  const delta = (root as unknown as { _retainedRootRepresentation(): RetainedRootRepresentation })._retainedRootRepresentation().derivedProduct?.delta;

  if (delta === undefined) {
    return served;
  }

  totals.query.cells += delta.cells;
  totals.query.candidates += delta.candidates;
  totals.query.entered += delta.entered;
  totals.query.exited += delta.exited;
  totals.query.visible += delta.visible;

  return served;
};

/** Item count of the root's persistent source, or 0 while it has none. */
export const sourceItemCount = (root: RenderNode): number =>
  (root as unknown as { _retainedRootRepresentation(): RetainedRootRepresentation })._retainedRootRepresentation().source?.itemCount ?? 0;

/** The rect the last capture culled against, or `null` while there is none. */
export const captureCullRectOf = (root: RenderNode): ReadonlyRectangle | null => {
  const representation = (root as unknown as { _retainedRootRepresentation(): RetainedRootRepresentation })._retainedRootRepresentation();
  const internals = representation as unknown as { _captureCullRect: ReadonlyRectangle; _hasCaptureCullRect: boolean };

  return internals._hasCaptureCullRect ? internals._captureCullRect : null;
};
