import type { ArchetypeSpec } from './EngineAdapter';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './world';

/**
 * The picking scene's shared definition: where the interactive rectangles sit
 * and which points every arm is asked about.
 *
 * Both have to be identical across arms for the comparison to mean anything. A
 * different layout would give one arm a different index to search, and a
 * different point set would ask one arm more hits than another - and a hit and a
 * miss cost different amounts in every implementation.
 */

/** Edge length of one interactive rectangle, in logical pixels. */
export const PICK_RECT_SIZE = 16;

/** Gap between rectangles. Wide enough that a fair share of the queries land on nothing. */
export const PICK_RECT_GAP = 8;

/** One queried point. */
export interface PickPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Rectangle layout: a grid that fills the viewport and then wraps into further
 * columns of the same grid, so the count scales the index rather than the area.
 *
 * Keeping the area fixed is what separates this scene from a drawing one. The
 * query always searches the same screen region; what grows is how many
 * candidates live in it, which is exactly the property a spatial index is
 * supposed to absorb.
 */
export const pickRectAt = (index: number): PickPoint => {
  const stride = PICK_RECT_SIZE + PICK_RECT_GAP;
  const columns = Math.max(1, Math.floor(VIEWPORT_WIDTH / stride));
  const rows = Math.max(1, Math.floor(VIEWPORT_HEIGHT / stride));
  const cell = index % (columns * rows);
  // Layers past the first are inset by a few pixels, so stacked rectangles
  // overlap rather than coincide: a query then has to order candidates by depth
  // instead of returning whichever it met first.
  const layer = Math.floor(index / (columns * rows));
  const inset = (layer % 4) * 2;

  return { x: (cell % columns) * stride + inset, y: Math.floor(cell / columns) * stride + inset };
};

/**
 * The point queried at position `index` of one frame's block.
 *
 * Fixed for every frame and every arm rather than drawn per frame: a moving set
 * would make one arm's block a different question from the next arm's, and the
 * measurement is about resolving a point, not about which points came up.
 *
 * The spiral deliberately walks across rectangles and gaps alike, so a
 * meaningful share of the queries resolve to nothing - an index that is fast
 * only on hits would otherwise look uniformly fast.
 */
export const pickPointAt = (index: number, total: number): PickPoint => {
  const turn = (index / Math.max(1, total)) * Math.PI * 8;
  const reach = (index + 1) / Math.max(1, total);

  return {
    x: VIEWPORT_WIDTH / 2 + Math.cos(turn) * reach * (VIEWPORT_WIDTH / 2 - PICK_RECT_SIZE),
    y: VIEWPORT_HEIGHT / 2 + Math.sin(turn) * reach * (VIEWPORT_HEIGHT / 2 - PICK_RECT_SIZE),
  };
};

/** Whether the archetype measures hit testing rather than drawing. */
export const isPickingScene = (spec: ArchetypeSpec): boolean => (spec.pointerQueriesPerFrame ?? 0) > 0;
