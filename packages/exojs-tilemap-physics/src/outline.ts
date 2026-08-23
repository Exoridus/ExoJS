import type { PointLike } from '@codexo/exojs';

/**
 * Boundary extraction for a set of whole tile cells.
 *
 * Turns an occupancy set into closed loops of grid vertices, wound so that the
 * physics convention (outward normal of the edge `v -> w` is `(wy - vy, vx - wx)`
 * normalised) puts the solid side outside an island boundary and inside a hole
 * boundary. In a +Y-down space that means an island loop has a positive
 * shoelace area and a hole loop a negative one.
 */

/** `+X`, `+Y`, `-X`, `-Y`, in that index order. */
const STEP_X = [1, 0, -1, 0] as const;
const STEP_Y = [0, 1, 0, -1] as const;

/**
 * Turn preference at a vertex where two loops touch, relative to the incoming
 * direction: toward the solid side first, then straight, then away from it.
 * Hugging the solid at every ambiguous corner is what separates two regions
 * that meet diagonally into two correctly wound loops instead of one loop that
 * crosses itself.
 */
const TURN_ORDER = [1, 0, 3] as const;

const key = (x: number, y: number): string => `${x},${y}`;

/** Which of the four directed unit edges leaving a vertex are still unused. */
type EdgeMap = Map<string, boolean[]>;

/**
 * Split an occupancy set into 4-connected components. Cells that touch only at
 * a corner are separate components: an 8-connected component would produce a
 * boundary that pinches at the shared vertex, where the solid side is not
 * defined.
 */
const components = (cells: ReadonlySet<string>, coordinates: readonly number[]): Array<Set<string>> => {
  const remaining = new Set(cells);
  const result: Array<Set<string>> = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    const startKey = key(coordinates[i]!, coordinates[i + 1]!);

    if (!remaining.has(startKey)) continue;

    const component = new Set<string>();
    const stack = [coordinates[i]!, coordinates[i + 1]!];

    remaining.delete(startKey);
    component.add(startKey);

    while (stack.length > 0) {
      const y = stack.pop()!;
      const x = stack.pop()!;

      for (let direction = 0; direction < 4; direction++) {
        const nx = x + STEP_X[direction]!;
        const ny = y + STEP_Y[direction]!;
        const neighbour = key(nx, ny);

        if (!remaining.has(neighbour)) continue;

        remaining.delete(neighbour);
        component.add(neighbour);
        stack.push(nx, ny);
      }
    }

    result.push(component);
  }

  return result;
};

/**
 * One directed unit edge per cell side that faces empty space, oriented so the
 * solid stays on the same side of every edge.
 */
const boundaryEdges = (component: ReadonlySet<string>): EdgeMap => {
  const edges: EdgeMap = new Map();

  const add = (x: number, y: number, direction: number): void => {
    const from = key(x, y);
    let slots = edges.get(from);

    if (slots === undefined) {
      slots = [false, false, false, false];
      edges.set(from, slots);
    }

    slots[direction] = true;
  };

  for (const cell of component) {
    const comma = cell.indexOf(',');
    const x = Number(cell.slice(0, comma));
    const y = Number(cell.slice(comma + 1));

    if (!component.has(key(x, y - 1))) add(x, y, 0);
    if (!component.has(key(x + 1, y))) add(x + 1, y, 1);
    if (!component.has(key(x, y + 1))) add(x + 1, y + 1, 2);
    if (!component.has(key(x - 1, y))) add(x, y + 1, 3);
  }

  return edges;
};

/**
 * Rotate a loop to start at its lowest `(x, y)` vertex. The walk starts wherever
 * the first unused edge happens to be, which depends on the order the cells were
 * handed in; a canonical start makes the emitted vertex array itself independent
 * of that, not just the boundary it describes.
 */
const rotateToLowestVertex = (loop: readonly number[]): number[] => {
  let start = 0;

  for (let i = 2; i < loop.length; i += 2) {
    const x = loop[i]!;
    const y = loop[i + 1]!;

    if (x < loop[start]! || (x === loop[start]! && y < loop[start + 1]!)) {
      start = i;
    }
  }

  return [...loop.slice(start), ...loop.slice(0, start)];
};

/** Drop every vertex whose two adjacent edges point the same way. */
const dropCollinear = (loop: readonly number[]): number[] => {
  const count = loop.length / 2;
  const reduced: number[] = [];

  for (let i = 0; i < count; i++) {
    const previous = (i - 1 + count) % count;
    const next = (i + 1) % count;
    const inX = loop[i * 2]! - loop[previous * 2]!;
    const inY = loop[i * 2 + 1]! - loop[previous * 2 + 1]!;
    const outX = loop[next * 2]! - loop[i * 2]!;
    const outY = loop[next * 2 + 1]! - loop[i * 2 + 1]!;

    if (inX * outY - inY * outX !== 0) {
      reduced.push(loop[i * 2]!, loop[i * 2 + 1]!);
    }
  }

  return reduced;
};

/** Flat `[x, y, ...]` coordinates as points. */
const toPoints = (loop: readonly number[]): PointLike[] => {
  const points: PointLike[] = [];

  for (let i = 0; i < loop.length; i += 2) {
    points.push({ x: loop[i]!, y: loop[i + 1]! });
  }

  return points;
};

/**
 * Trace the boundary of a set of whole tile cells into closed loops of grid
 * vertices.
 *
 * @param coordinates - Cell coordinates as `[tx, ty, tx, ty, ...]`. Duplicates
 *                      are ignored.
 * @returns One loop of grid vertices per boundary: the outer boundary of every
 *          4-connected component plus one loop per enclosed hole. Collinear
 *          vertices are removed, so a straight run of 200 cells is two
 *          vertices. Loops carry no repeated closing vertex.
 */
export const traceCellOutlines = (coordinates: readonly number[]): PointLike[][] => {
  const cells = new Set<string>();

  for (let i = 0; i < coordinates.length; i += 2) {
    cells.add(key(coordinates[i]!, coordinates[i + 1]!));
  }

  const loops: PointLike[][] = [];

  for (const component of components(cells, coordinates)) {
    const edges = boundaryEdges(component);

    for (const [startVertex, startSlots] of edges) {
      for (let startDirection = 0; startDirection < 4; startDirection++) {
        if (!startSlots[startDirection]) continue;

        const comma = startVertex.indexOf(',');
        const loop: number[] = [];
        let x = Number(startVertex.slice(0, comma));
        let y = Number(startVertex.slice(comma + 1));
        let direction = startDirection;

        for (;;) {
          const slots = edges.get(key(x, y))!;

          slots[direction] = false;
          loop.push(x, y);
          x += STEP_X[direction]!;
          y += STEP_Y[direction]!;

          const nextSlots = edges.get(key(x, y));

          if (nextSlots === undefined) break;

          let next = -1;

          for (const turn of TURN_ORDER) {
            const candidate = (direction + turn) % 4;

            if (nextSlots[candidate]) {
              next = candidate;
              break;
            }
          }

          if (next === -1) break;

          direction = next;
        }

        if (loop.length >= 6) {
          loops.push(toPoints(rotateToLowestVertex(dropCollinear(loop))));
        }
      }
    }
  }

  return loops;
};
