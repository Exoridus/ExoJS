import type { ArchetypeSpec } from './EngineAdapter';

/**
 * Shared scene-space geometry: the grid every archetype lays its leaves on, and
 * the deterministic camera path the scrolling archetypes drive.
 *
 * Both live here rather than in the adapters for the same reason
 * `selectMutationIndices` does: every arm must place the identical leaf at the
 * identical world position and must observe the identical camera centre for a
 * given frame index, or the arms are not comparable. A single implementation
 * makes that a fact rather than a convention two files happen to agree on, and
 * lets the archetype tests assert the resulting off-screen fraction against the
 * same code the adapters run.
 */

/**
 * Fixed design-space viewport the harness canvas renders (see
 * `page/index.html` and `page/harness.ts`'s STAGE_*). Every arm initialises its
 * engine at exactly this size, so it is the reference rect for both the grid
 * layout and the camera path.
 */
export const VIEWPORT_WIDTH = 1280;
export const VIEWPORT_HEIGHT = 720;
/** Inset that keeps every gridded leaf (plus its mutation wobble) off the world edge. */
export const GRID_MARGIN = 32;
/** Side length of the generated per-archetype textures / leaf quads, in pixels. */
export const SPRITE_SIZE = 8;

/** Row/column layout of the leaf grid, plus the cell size derived from it. */
export interface GridLayout {
  /** Number of grid columns. */
  readonly columns: number;
  /** Number of grid rows. */
  readonly rows: number;
  /** Width of one grid cell, in world units. */
  readonly cellWidth: number;
  /** Height of one grid cell, in world units. */
  readonly cellHeight: number;
}

/** A world-space point — the camera centre, or one leaf's resting position. */
export interface WorldPoint {
  /** World-space x coordinate. */
  readonly x: number;
  /** World-space y coordinate. */
  readonly y: number;
}

/** Size of the world the scene is laid out across, in world units. */
export interface WorldExtent {
  /** World width. */
  readonly width: number;
  /** World height. */
  readonly height: number;
}

/**
 * Near-square grid covering `width` x `height` inset by `margin` on every side.
 * The margin is what keeps a leaf (plus its mutation wobble) off the world edge,
 * so a non-scrolling archetype's sprites stay fully inside the view.
 */
export const gridLayout = (nodeCount: number, width: number, height: number, margin: number): GridLayout => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
  const rows = Math.max(1, Math.ceil(nodeCount / columns));

  return {
    columns,
    rows,
    cellWidth: (width - 2 * margin) / columns,
    cellHeight: (height - 2 * margin) / rows,
  };
};

/** Resting position of leaf `index` on `layout`, in row-major order. */
export const gridPosition = (index: number, layout: GridLayout, margin: number): WorldPoint => ({
  x: margin + (index % layout.columns) * layout.cellWidth + layout.cellWidth / 2,
  y: margin + Math.floor(index / layout.columns) * layout.cellHeight + layout.cellHeight / 2,
});

/**
 * Whether this archetype scrolls a camera across a world larger than the
 * viewport. Keyed on {@link ArchetypeSpec.cameraSpeed} being a positive number:
 * an archetype that leaves it unset keeps the fixed, viewport-sized world every
 * pre-existing archetype uses.
 */
export const isScrolling = (spec: ArchetypeSpec): boolean => (spec.cameraSpeed ?? 0) > 0;

/**
 * World extent for an archetype: `worldSpan` viewports per AXIS, so the content
 * multiple is its square (`worldSpan: 2` means 4x the viewport's area). A
 * non-scrolling archetype gets exactly the viewport, which is what every
 * pre-existing archetype assumes.
 */
export const worldExtent = (spec: ArchetypeSpec, viewportWidth: number, viewportHeight: number): WorldExtent => {
  const span = isScrolling(spec) ? Math.max(1, spec.worldSpan ?? 1) : 1;

  return { width: viewportWidth * span, height: viewportHeight * span };
};

/**
 * Triangle wave: `value` folded back and forth inside `[0, span]`.
 *
 * A reflecting path rather than a wrapping one, because a wrap teleports the
 * camera by a full span in one frame — a single frame of total re-collection
 * that has nothing to do with the scroll rate under study. Reflection keeps the
 * speed constant and the path continuous, so the only discontinuity in the whole
 * run is the direction flip at each wall.
 */
const reflect = (value: number, span: number): number => {
  if (span <= 0) {
    return 0;
  }

  const period = 2 * span;
  const wrapped = ((value % period) + period) % period;

  return wrapped <= span ? wrapped : period - wrapped;
};

/**
 * Camera centre for `frame`, as a CLOSED FORM in the frame index rather than an
 * accumulated position. Warmup and timed frames therefore see one continuous
 * path, a re-run lands on the identical centres, and both arms agree without
 * having to synchronise any state.
 *
 * The camera travels the diagonal at {@link ArchetypeSpec.cameraSpeed} world
 * units per frame — equal per-axis components of a unit diagonal, so the SPEED
 * is the archetype's parameter, not the per-axis rate — and reflects off the
 * world edges. The two axes have different travel spans whenever the viewport is
 * not square (1280x720 gives 1280 and 720), so the reflections desync and the
 * path never degenerates into retracing one line.
 */
export const cameraCenterAt = (spec: ArchetypeSpec, frame: number, viewportWidth: number, viewportHeight: number): WorldPoint => {
  const world = worldExtent(spec, viewportWidth, viewportHeight);

  if (!isScrolling(spec)) {
    return { x: world.width / 2, y: world.height / 2 };
  }

  // The centre may travel only as far as keeps the view inside the world, so
  // the visible rect is always fully covered by content and the off-screen
  // fraction stays at the archetype's design value for every frame.
  const travel = frame * (spec.cameraSpeed ?? 0) * Math.SQRT1_2;

  return {
    x: viewportWidth / 2 + reflect(travel, world.width - viewportWidth),
    y: viewportHeight / 2 + reflect(travel, world.height - viewportHeight),
  };
};

/**
 * Number of leaves whose quad intersects the view rect at `frame` — the
 * archetype's on-screen node count, computed from the same layout and camera
 * path the adapters use.
 *
 * Analytic on purpose: the harness's structural probe counts GPU draw calls, not
 * nodes, and reading an engine's own culling statistics would make the figure
 * arm-specific. This is neutral, so a test can pin an archetype's off-screen
 * fraction as a property of the archetype rather than of whoever renders it.
 */
export const visibleLeafCount = (
  spec: ArchetypeSpec,
  nodeCount: number,
  frame: number,
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
  leafSize: number,
): number => {
  const world = worldExtent(spec, viewportWidth, viewportHeight);
  const layout = gridLayout(nodeCount, world.width, world.height, margin);
  const centre = cameraCenterAt(spec, frame, viewportWidth, viewportHeight);
  const left = centre.x - viewportWidth / 2;
  const top = centre.y - viewportHeight / 2;
  const right = left + viewportWidth;
  const bottom = top + viewportHeight;

  let visible = 0;

  for (let index = 0; index < nodeCount; index++) {
    const position = gridPosition(index, layout, margin);

    // Leaves anchor top-left (both adapters leave the anchor at its default),
    // so the quad spans [x, x + leafSize) x [y, y + leafSize).
    if (position.x < right && position.x + leafSize > left && position.y < bottom && position.y + leafSize > top) {
      visible++;
    }
  }

  return visible;
};
