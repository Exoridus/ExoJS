import { assert } from '#core/dev';

/**
 * Triangulate a simple 2D polygon by ear-clipping.
 *
 * Input: `vertices` is a flat sequence of (x, y) pairs (length must be even,
 * minimum 6 = 3 vertices). Polygon may be CW or CCW; the algorithm normalises
 * to CCW internally.
 *
 * Output: a `Uint32Array` of indices in groups of 3 (per triangle), referencing
 * vertex positions (the i-th vertex spans `vertices[2*i], vertices[2*i + 1]`).
 *
 * Polygons that are degenerate (all collinear), zero-area, or self-intersecting
 * may produce incomplete output but must not throw or hang.
 *
 * @param vertices flat (x, y) pairs
 * @returns triangle index list (length is multiple of 3)
 */
export const triangulate = (vertices: ArrayLike<number>): Uint32Array => {
  // An odd length is a caller error that cannot be reported by the return
  // value: the trailing coordinate is dropped and the result looks like a
  // successful triangulation of a polygon the caller never described.
  assert(vertices.length % 2 === 0, 'triangulate: vertices must hold (x, y) pairs, so its length must be even.');

  const n = vertices.length >> 1;

  if (n < 3) {
    return new Uint32Array(0);
  }

  if (n === 3) {
    // Return in CCW order; swap if input triangle is CW.
    // n === 3 guarantees indices 0..5 exist.
    const ax = vertices[0]!;
    const ay = vertices[1]!;
    const bx = vertices[2]!;
    const by = vertices[3]!;
    const cx = vertices[4]!;
    const cy = vertices[5]!;

    return isCcwTriangle(ax, ay, bx, by, cx, cy) ? new Uint32Array([0, 1, 2]) : new Uint32Array([2, 1, 0]);
  }

  const ccw = signedArea(vertices) >= 0;
  const order: number[] = [];

  // A clockwise polygon is walked backwards from vertex 0, so the ring is CCW
  // and the clip sequence starts at the same vertex either way.
  for (let i = 0; i < n; i++) {
    order.push(ccw || i === 0 ? i : n - i);
  }

  const ring = createRing(order);

  return earClip(vertices, ring);
};

/**
 * Triangulate a polygon with holes. `vertices` holds the outer ring followed by
 * every hole ring as flat (x, y) pairs; `holeStarts` lists the vertex index at
 * which each hole begins, in ascending order. Rings may use either winding.
 *
 * Holes must lie strictly inside the outer ring and must not overlap each
 * other or touch the outline. Returned indices reference `vertices`.
 * @internal
 */
export const triangulateWithHoles = (vertices: ArrayLike<number>, holeStarts: readonly number[]): Uint32Array => {
  if (holeStarts.length === 0) {
    return triangulate(vertices);
  }

  assert(vertices.length % 2 === 0, 'triangulateWithHoles: vertices must hold (x, y) pairs, so its length must be even.');

  const total = vertices.length >> 1;

  const ringIndices = (from: number, to: number, clockwise: boolean): number[] => {
    const indices: number[] = [];

    for (let i = from; i < to; i++) {
      indices.push(i);
    }

    if (signedArea(indices.flatMap(index => [vertices[index * 2]!, vertices[index * 2 + 1]!])) < 0 !== clockwise) {
      indices.reverse();
    }

    return indices;
  };

  const outer = ringIndices(0, holeStarts[0]!, false);

  if (outer.length < 3) {
    return new Uint32Array(0);
  }

  const ring = createRing(outer);
  const holes: number[][] = [];

  for (let h = 0; h < holeStarts.length; h++) {
    const hole = ringIndices(holeStarts[h]!, holeStarts[h + 1] ?? total, true);

    if (hole.length >= 3) {
      holes.push(hole);
    }
  }

  // Bridging the hole with the largest x first keeps every later ray from
  // crossing a hole that has not been merged yet: all of them lie to its left.
  const maxX = (hole: readonly number[]): number => Math.max(...hole.map(index => vertices[index * 2]!));

  holes.sort((a, b) => maxX(b) - maxX(a));

  for (const hole of holes) {
    let rightmost = 0;

    for (let i = 1; i < hole.length; i++) {
      if (vertices[hole[i]! * 2]! > vertices[hole[rightmost]! * 2]!) {
        rightmost = i;
      }
    }

    const target = findBridgeTarget(vertices, ring, hole[rightmost]!);

    if (target !== -1) {
      spliceHole(ring, target, hole, rightmost);
    }
  }

  return earClip(vertices, ring);
};

/** Linked node ring; a vertex appears on several nodes once holes are bridged in. */
interface Ring {
  readonly vertex: number[];
  readonly prev: number[];
  readonly next: number[];
}

const createRing = (order: readonly number[]): Ring => {
  const count = order.length;
  const ring: Ring = { vertex: [], prev: [], next: [] };

  for (let i = 0; i < count; i++) {
    ring.vertex.push(order[i]!);
    ring.prev.push((i + count - 1) % count);
    ring.next.push((i + 1) % count);
  }

  return ring;
};

const cross = (ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number =>
  (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);

/** Whether the direction from `node` to (mx, my) points into the ring's interior wedge at `node`. */
const locallyInside = (vertices: ArrayLike<number>, ring: Ring, node: number, mx: number, my: number): boolean => {
  const r = ring.vertex[node]!;
  const p = ring.vertex[ring.prev[node]!]!;
  const n = ring.vertex[ring.next[node]!]!;
  const rx = vertices[r * 2]!;
  const ry = vertices[r * 2 + 1]!;
  const px = vertices[p * 2]!;
  const py = vertices[p * 2 + 1]!;
  const nx = vertices[n * 2]!;
  const ny = vertices[n * 2 + 1]!;

  if (cross(px, py, rx, ry, nx, ny) > 0) {
    return cross(rx, ry, nx, ny, mx, my) >= 0 && cross(rx, ry, mx, my, px, py) >= 0;
  }

  return !(cross(rx, ry, px, py, mx, my) > 0 && cross(rx, ry, mx, my, nx, ny) > 0);
};

/** Among the nodes sharing `node`'s position, the one whose interior wedge faces (mx, my). */
const pickLocallyInside = (vertices: ArrayLike<number>, ring: Ring, node: number, mx: number, my: number): number => {
  const v = ring.vertex[node]!;
  const x = vertices[v * 2]!;
  const y = vertices[v * 2 + 1]!;

  if (locallyInside(vertices, ring, node, mx, my)) {
    return node;
  }

  let other = 0;

  do {
    const w = ring.vertex[other]!;

    if (vertices[w * 2] === x && vertices[w * 2 + 1] === y && locallyInside(vertices, ring, other, mx, my)) {
      return other;
    }

    other = ring.next[other]!;
  } while (other !== 0);

  return node;
};

const pointInOrOnTriangle = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean => {
  const d1 = cross(ax, ay, bx, by, px, py);
  const d2 = cross(bx, by, cx, cy, px, py);
  const d3 = cross(cx, cy, ax, ay, px, py);

  return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
};

/**
 * Find a ring node visible from hole vertex `m`: cast a ray towards +x, take the
 * nearest edge it hits, then prefer any ring vertex inside the triangle between
 * `m`, the hit point and that edge's right end with the smallest angle to the
 * ray - the one vertex nothing else can occlude.
 */
const findBridgeTarget = (vertices: ArrayLike<number>, ring: Ring, m: number): number => {
  const mx = vertices[m * 2]!;
  const my = vertices[m * 2 + 1]!;
  let hitX = Infinity;
  let candidate = -1;
  let node = 0;

  do {
    const nextNode = ring.next[node]!;
    const a = ring.vertex[node]!;
    const b = ring.vertex[nextNode]!;
    const ax = vertices[a * 2]!;
    const ay = vertices[a * 2 + 1]!;
    const bx = vertices[b * 2]!;
    const by = vertices[b * 2 + 1]!;

    if (ay !== by && my >= Math.min(ay, by) && my <= Math.max(ay, by)) {
      const x = ax + ((my - ay) * (bx - ax)) / (by - ay);

      if (x >= mx && x < hitX) {
        hitX = x;

        if (my === ay) {
          candidate = node;
        } else if (my === by) {
          candidate = nextNode;
        } else {
          candidate = ax > bx ? node : nextNode;
        }
      }
    }

    node = nextNode;
  } while (node !== 0);

  if (candidate === -1) {
    return -1;
  }

  const c = ring.vertex[candidate]!;
  const cx = vertices[c * 2]!;
  const cy = vertices[c * 2 + 1]!;

  if (cy === my) {
    return pickLocallyInside(vertices, ring, candidate, mx, my);
  }

  let best = pickLocallyInside(vertices, ring, candidate, mx, my);
  let bestTan = Math.abs(cy - my) / (cx - mx);
  let bestDistance = cx - mx;

  node = 0;

  do {
    const v = ring.vertex[node]!;
    const vx = vertices[v * 2]!;
    const vy = vertices[v * 2 + 1]!;

    if (vx > mx && !(vx === cx && vy === cy) && pointInOrOnTriangle(vx, vy, mx, my, hitX, my, cx, cy)) {
      const tan = Math.abs(vy - my) / (vx - mx);

      if ((tan < bestTan || (tan === bestTan && vx - mx < bestDistance)) && locallyInside(vertices, ring, node, mx, my)) {
        best = node;
        bestTan = tan;
        bestDistance = vx - mx;
      }
    }

    node = ring.next[node]!;
  } while (node !== 0);

  return best;
};

/** Insert `hole` after `target` through a two-way bridge: target, hole..., hole[start] again, target again. */
const spliceHole = (ring: Ring, target: number, hole: readonly number[], start: number): void => {
  const first = ring.vertex.length;
  const count = hole.length;

  for (let i = 0; i < count; i++) {
    ring.vertex.push(hole[(start + i) % count]!);
    ring.prev.push(first + i - 1);
    ring.next.push(first + i + 1);
  }

  const holeBridge = ring.vertex.length;
  const targetBridge = holeBridge + 1;
  const after = ring.next[target]!;

  ring.vertex.push(hole[start]!, ring.vertex[target]!);
  ring.prev.push(holeBridge - 1, holeBridge);
  ring.next.push(targetBridge, after);

  ring.prev[first] = target;
  ring.next[target] = first;
  ring.prev[after] = targetBridge;
};

/** Ear-clip a counter-clockwise node ring; at most O(n^2) iterations, bailing after a pass without an ear. */
const earClip = (vertices: ArrayLike<number>, ring: Ring): Uint32Array => {
  const { vertex, prev, next } = ring;
  const n = vertex.length;
  const out = new Uint32Array((n - 2) * 3);
  let outIdx = 0;
  let remaining = n;
  let current = 0;

  while (remaining > 3) {
    let earFound = false;
    const passStart = current;

    do {
      const p = prev[current]!;
      const nx = next[current]!;
      const a = vertex[p]!;
      const b = vertex[current]!;
      const c = vertex[nx]!;

      if (
        isCcwTriangle(
          vertices[a * 2]!,
          vertices[a * 2 + 1]!,
          vertices[b * 2]!,
          vertices[b * 2 + 1]!,
          vertices[c * 2]!,
          vertices[c * 2 + 1]!,
        ) &&
        isEar(vertices, vertex, next, p, current, nx)
      ) {
        out[outIdx++] = a;
        out[outIdx++] = b;
        out[outIdx++] = c;
        next[p] = nx;
        prev[nx] = p;
        remaining--;
        earFound = true;
        current = nx;
        break;
      }

      current = next[current]!;
    } while (current !== passStart);

    if (!earFound) {
      // Degenerate polygon: no ear found in a full pass; bail out.
      break;
    }
  }

  // Emit the final triangle in CCW order; earlier clips can leave the last three in either direction.
  if (remaining === 3) {
    const a = vertex[prev[current]!]!;
    const b = vertex[current]!;
    const c = vertex[next[current]!]!;

    if (
      isCcwTriangle(vertices[a * 2]!, vertices[a * 2 + 1]!, vertices[b * 2]!, vertices[b * 2 + 1]!, vertices[c * 2]!, vertices[c * 2 + 1]!)
    ) {
      out[outIdx++] = a;
      out[outIdx++] = b;
      out[outIdx++] = c;
    } else {
      out[outIdx++] = c;
      out[outIdx++] = b;
      out[outIdx++] = a;
    }
  }

  return out.subarray(0, outIdx);
};

/** Shoelace signed area. Positive = CCW (mathematical orientation), negative = CW. */
const signedArea = (vertices: ArrayLike<number>): number => {
  const n = vertices.length >> 1;
  let area = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // i, j in [0, n-1]; vertices holds 2n entries.
    const x0 = vertices[i * 2]!;
    const y0 = vertices[i * 2 + 1]!;
    const x1 = vertices[j * 2]!;
    const y1 = vertices[j * 2 + 1]!;

    area += x0 * y1 - x1 * y0;
  }

  return area; // Positive = CCW, negative = CW.
};

/**
 * Returns true if the triangle (a, b, c) has a counter-clockwise (CCW) winding.
 * Uses the cross product of (b-a) × (c-a); positive = CCW.
 */
const isCcwTriangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;

/**
 * Returns true if point (px, py) lies strictly inside triangle (a, b, c).
 * Uses sign-of-cross-products. Boundary points (including corners) return false.
 */
const pointInTriangle = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean => {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  // Strictly inside: all same sign and none are exactly zero (exclude boundary).
  return !(hasNeg && hasPos) && d1 !== 0 && d2 !== 0 && d3 !== 0;
};

/**
 * Returns true if point (px, py) lies on the open segment (a, b) - its endpoints
 * excluded.
 */
const pointOnOpenSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean => {
  if ((px - ax) * (by - ay) - (py - ay) * (bx - ax) !== 0) {
    return false;
  }

  const withinX = px > Math.min(ax, bx) && px < Math.max(ax, bx);
  const withinY = py > Math.min(ay, by) && py < Math.max(ay, by);

  return withinX || withinY;
};

/**
 * Returns true if node v is an ear: the triangle (previousNode, v, nextNode)
 * contains no other ring vertex strictly inside it, and no other vertex sits on
 * the diagonal the clip would introduce.
 */
const isEar = (
  vertices: ArrayLike<number>,
  vertex: readonly number[],
  next: readonly number[],
  previousNode: number,
  v: number,
  nextNode: number,
): boolean => {
  const ax = vertices[vertex[previousNode]! * 2]!;
  const ay = vertices[vertex[previousNode]! * 2 + 1]!;
  const bx = vertices[vertex[v]! * 2]!;
  const by = vertices[vertex[v]! * 2 + 1]!;
  const cx = vertices[vertex[nextNode]! * 2]!;
  const cy = vertices[vertex[nextNode]! * 2 + 1]!;

  let node = next[nextNode]!;

  while (node !== previousNode) {
    const px = vertices[vertex[node]! * 2]!;
    const py = vertices[vertex[node]! * 2 + 1]!;

    // A vertex exactly on the prev → next diagonal is not "inside" the ear, but
    // clipping across it pinches the polygon at that vertex and every later
    // clip then works on a non-simple ring - which silently produces triangles
    // outside the outline. Vertices on the other two edges are collinear
    // points along existing polygon edges and stay harmless.
    if (pointInTriangle(px, py, ax, ay, bx, by, cx, cy) || pointOnOpenSegment(px, py, ax, ay, cx, cy)) {
      return false;
    }

    node = next[node]!;
  }

  return true;
};
