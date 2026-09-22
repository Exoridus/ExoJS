/** Lattice step of each walk direction, and the bit that marks it used. */
const up = 0;
const right = 1;
const down = 2;
const left = 3;

const stepX = [0, 1, 0, -1];
const stepY = [-1, 0, 1, 0];

/**
 * Trace the outlines of an occupancy field as closed loops of lattice points.
 *
 * The field is sampled per cell, and the loops run along cell boundaries, so a
 * point `(x, y)` is a corner of cell `(x, y)` and the coordinates are in cell
 * units with the field's top-left cell at the origin. Holes come back as loops
 * of their own, which is what lets a window in a wall let light through.
 *
 * Every loop is closed implicitly: the last point joins the first, and the
 * first is not repeated.
 *
 * Diagonal contacts are traced as two loops meeting at a point rather than one
 * loop around both cells. For shadows the distinction does not change the
 * silhouette, and keeping the regions apart avoids a loop that crosses itself.
 * @internal
 */
export const traceContours = (solid: (x: number, y: number) => boolean, width: number, height: number): number[][] => {
  const nodeStride = width + 1;
  const used = new Uint8Array(nodeStride * (height + 1));
  const contours: number[][] = [];

  const quadrants = (x: number, y: number): number => {
    const topLeft = solid(x - 1, y - 1) ? 1 : 0;
    const topRight = solid(x, y - 1) ? 2 : 0;
    const bottomLeft = solid(x - 1, y) ? 4 : 0;
    const bottomRight = solid(x, y) ? 8 : 0;

    return topLeft | topRight | bottomLeft | bottomRight;
  };

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const state = quadrants(x, y);

      for (let direction = 0; direction < 4; direction++) {
        if (!leaves(state, direction) || (used[y * nodeStride + x]! & (1 << direction)) !== 0) {
          continue;
        }

        contours.push(walk(quadrants, used, nodeStride, x, y, direction));
      }
    }
  }

  return contours;
};

/**
 * Whether the boundary leaves a node in `direction`, which it does when the
 * cell on the left of that heading is filled and the one on its right is not.
 * The rule is the same for all four headings, so a walk keeps one region on
 * one side for its whole length.
 */
const leaves = (state: number, direction: number): boolean => {
  switch (direction) {
    case up:
      return (state & 1) !== 0 && (state & 2) === 0;
    case right:
      return (state & 2) !== 0 && (state & 8) === 0;
    case down:
      return (state & 8) !== 0 && (state & 4) === 0;
    default:
      return (state & 4) !== 0 && (state & 1) === 0;
  }
};

/**
 * At a node where two filled cells meet only diagonally, two headings qualify.
 * Continuing with the one whose filled cell is the one just followed keeps the
 * two regions apart; the other would cross over into the opposite blob.
 */
const resolveSaddle = (state: number, incoming: number): number => {
  if (state === 9) {
    // Top-left and bottom-right: arriving along the top edge continues down.
    return incoming === left ? down : up;
  }

  // Top-right and bottom-left.
  return incoming === down ? right : left;
};

const walk = (
  quadrants: (x: number, y: number) => number,
  used: Uint8Array,
  nodeStride: number,
  startX: number,
  startY: number,
  startDirection: number,
): number[] => {
  const points: number[] = [];

  let x = startX;
  let y = startY;
  let direction = startDirection;

  for (;;) {
    const node = y * nodeStride + x;
    const bit = 1 << direction;

    if ((used[node]! & bit) !== 0) {
      break;
    }

    used[node] = used[node]! | bit;
    points.push(x, y);

    x += stepX[direction]!;
    y += stepY[direction]!;

    const state = quadrants(x, y);

    if (state === 6 || state === 9) {
      direction = resolveSaddle(state, direction);
      continue;
    }

    let next = -1;

    for (let candidate = 0; candidate < 4; candidate++) {
      if (leaves(state, candidate)) {
        next = candidate;
        break;
      }
    }

    if (next === -1) {
      break;
    }

    direction = next;
  }

  return points;
};

/**
 * Drop points a closed outline does not need, keeping every remaining point
 * within `tolerance` of the original shape.
 *
 * Traced outlines are staircases of one-cell steps, and a diagonal wall drawn
 * that way costs one segment per pixel. Simplifying is what makes an alpha
 * outline affordable as an occluder; a tolerance of `0` only removes points
 * that lie exactly on the line between their neighbours.
 *
 * Returns a loop of at least three points, or an empty array when the outline
 * collapses to a line.
 * @internal
 */
export const simplifyLoop = (points: readonly number[], tolerance: number): number[] => {
  const count = points.length >> 1;

  if (count < 3) {
    return [];
  }

  // A closed loop has no endpoints to anchor the split on, so the point
  // farthest from the first one stands in: both halves then run between two
  // points that are certainly on the simplified hull.
  let pivot = 0;
  let farthest = -1;

  for (let index = 1; index < count; index++) {
    const dx = points[index * 2]! - points[0]!;
    const dy = points[index * 2 + 1]! - points[1]!;
    const distance = dx * dx + dy * dy;

    if (distance > farthest) {
      farthest = distance;
      pivot = index;
    }
  }

  const simplified: number[] = [];

  simplified.push(points[0]!, points[1]!);
  reduce(points, 0, pivot, tolerance, simplified);
  simplified.push(points[pivot * 2]!, points[pivot * 2 + 1]!);
  reduce(points, pivot, count, tolerance, simplified);

  return simplified.length >= 6 ? simplified : [];
};

/**
 * Douglas-Peucker over `points[first .. last]`, appending the kept interior
 * points to `out`. `last === count` wraps back to point `0`, which is how the
 * closing half of a loop is reduced without copying the array.
 */
const reduce = (points: readonly number[], first: number, last: number, tolerance: number, out: number[]): void => {
  if (last - first < 2) {
    return;
  }

  const count = points.length >> 1;
  const endIndex = last === count ? 0 : last;
  const startX = points[first * 2]!;
  const startY = points[first * 2 + 1]!;
  const endX = points[endIndex * 2]!;
  const endY = points[endIndex * 2 + 1]!;
  const edgeX = endX - startX;
  const edgeY = endY - startY;
  const lengthSquared = edgeX * edgeX + edgeY * edgeY;

  let split = -1;
  let worst = tolerance * tolerance;

  for (let index = first + 1; index < last; index++) {
    const px = points[index * 2]! - startX;
    const py = points[index * 2 + 1]! - startY;
    const cross = lengthSquared === 0 ? px * px + py * py : (px * edgeY - py * edgeX) ** 2 / lengthSquared;

    if (cross > worst) {
      worst = cross;
      split = index;
    }
  }

  if (split === -1) {
    return;
  }

  reduce(points, first, split, tolerance, out);
  out.push(points[split * 2]!, points[split * 2 + 1]!);
  reduce(points, split, last, tolerance, out);
};
