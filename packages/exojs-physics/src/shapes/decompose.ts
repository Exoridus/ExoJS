import type { PointLike } from '@codexo/exojs';
import { triangulate } from '@codexo/exojs';

/** Vertices closer than this (px) are welded into one. */
const weldEpsilon = 1e-4;
/**
 * Sine-of-turn threshold below which three consecutive vertices count as
 * collinear. Compared against the normalised cross product so the test is
 * scale-free: a 10 px polygon and a 10 000 px one accept the same shapes.
 */
const collinearEpsilon = 1e-7;
/**
 * Fraction of the outline's area below which a triangulation face counts as
 * empty. Ear clipping emits its last triangle without an orientation test, so a
 * polygon whose final three vertices end up collinear yields one zero-area face
 * - it covers nothing and must not become a collider.
 */
const degenerateAreaFraction = 1e-9;

/**
 * Split a simple polygon into convex parts.
 *
 * The input may be concave, wound either way, and may carry duplicate or
 * collinear vertices; it must not intersect itself. The result is a list of
 * strictly convex, counter-clockwise parts whose union is the input and whose
 * interiors do not overlap. An already-convex input yields exactly one part.
 *
 * Deterministic: the same cleaned input always produces the same parts. The
 * number of parts and their order are an artefact of the current algorithm and
 * must not be relied on - assert convexity, preserved area and preserved mass
 * properties instead.
 *
 * Cost is O(n²) in the vertex count (self-intersection check and ear clipping),
 * which suits import-time geometry rather than a per-step path.
 *
 * @throws RangeError if a coordinate is not finite, if fewer than three
 * distinct non-collinear vertices remain after cleanup, or if the outline
 * intersects itself.
 * @internal
 */
export const decomposeToConvexParts = (vertices: ReadonlyArray<Readonly<PointLike>>): PointLike[][] => {
  const points = normalize(vertices);
  const count = points.length / 2;

  assertSimple(points);

  if (isStrictlyConvex(points)) {
    return [toPoints(points, sequence(count))];
  }

  const indices = triangulate(points);

  // Ear clipping stops early rather than throwing when it cannot find an ear,
  // so a short index list is how a polygon that survived the checks above but is
  // still numerically degenerate shows up. Accepting it would silently drop area.
  if (indices.length !== (count - 2) * 3) {
    throw new RangeError(`decomposeToConvexParts: could not triangulate the outline (${indices.length / 3} of ${count - 2} triangles); check it for near-degenerate geometry.`);
  }

  const sourceArea = Math.abs(signedArea(points));
  const cycles = mergeTriangles(points, indices, sourceArea * degenerateAreaFraction);
  const parts = cycles.map(cycle => toPoints(points, cycle));

  // Post-condition rather than trust: ear clipping and the merge pass both work
  // on floating-point turns, and any future change that started losing area
  // would otherwise show up as a silently smaller collider.
  const partArea = cycles.reduce((sum, cycle) => sum + Math.abs(cycleArea(points, cycle)), 0);

  if (parts.length === 0 || Math.abs(partArea - sourceArea) > sourceArea * 1e-6) {
    throw new RangeError(`decomposeToConvexParts: the parts cover ${partArea.toFixed(4)} of the outline's ${sourceArea.toFixed(4)}; the outline is too degenerate to decompose.`);
  }

  return parts;
};

/**
 * Weld coincident vertices, drop collinear ones and canonicalise to
 * counter-clockwise, returning a flat `[x0, y0, x1, y1, ...]` array.
 */
const normalize = (vertices: ReadonlyArray<Readonly<PointLike>>): number[] => {
  const points: number[] = [];

  for (const vertex of vertices) {
    if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
      throw new RangeError(`decomposeToConvexParts: vertex has a non-finite component (${vertex.x}, ${vertex.y}).`);
    }

    if (points.length === 0) {
      points.push(vertex.x, vertex.y);

      continue;
    }

    if (Math.hypot(vertex.x - points[points.length - 2]!, vertex.y - points[points.length - 1]!) >= weldEpsilon) {
      points.push(vertex.x, vertex.y);
    }
  }

  // A trailing vertex coinciding with the first closes the ring explicitly; the
  // ring is implicit here.
  if (points.length >= 4 && Math.hypot(points[0]! - points[points.length - 2]!, points[1]! - points[points.length - 1]!) < weldEpsilon) {
    points.length -= 2;
  }

  if (signedArea(points) < 0) {
    reverseWinding(points);
  }

  dropCollinear(points);

  if (points.length < 6) {
    throw new RangeError(`decomposeToConvexParts: needs at least 3 distinct, non-collinear vertices, received ${points.length / 2} after cleanup.`);
  }

  if (Math.abs(signedArea(points)) <= weldEpsilon) {
    throw new RangeError('decomposeToConvexParts: the outline encloses no area.');
  }

  return points;
};

/**
 * Remove every vertex whose two edges are collinear. Repeats until stable: one
 * removal can make its neighbour collinear in turn.
 */
const dropCollinear = (points: number[]): void => {
  let removed = true;

  while (removed && points.length >= 6) {
    removed = false;

    for (let i = 0; i < points.length / 2; i++) {
      const count = points.length / 2;

      if (count < 3) {
        break;
      }

      const p = (i + count - 1) % count;
      const n = (i + 1) % count;

      if (isCollinear(points, p, i, n)) {
        points.splice(i * 2, 2);
        removed = true;
        i--;
      }
    }
  }
};

const isCollinear = (points: number[], a: number, b: number, c: number): boolean => {
  const e1x = points[b * 2]! - points[a * 2]!;
  const e1y = points[b * 2 + 1]! - points[a * 2 + 1]!;
  const e2x = points[c * 2]! - points[b * 2]!;
  const e2y = points[c * 2 + 1]! - points[b * 2 + 1]!;
  const lengths = Math.hypot(e1x, e1y) * Math.hypot(e2x, e2y);

  return lengths === 0 || Math.abs(e1x * e2y - e1y * e2x) <= collinearEpsilon * lengths;
};

/**
 * Reject an outline that crosses or touches itself. Every pair of non-adjacent
 * edges must be disjoint - a shared point between them is exactly what makes a
 * polygon non-simple, and both ear clipping and the solver assume it cannot
 * happen.
 */
const assertSimple = (points: number[]): void => {
  const count = points.length / 2;

  for (let i = 0; i < count; i++) {
    const iNext = (i + 1) % count;

    for (let j = i + 1; j < count; j++) {
      const jNext = (j + 1) % count;

      // Edges sharing a vertex always "touch" at it; only non-adjacent pairs
      // carry information.
      if (i === j || iNext === j || jNext === i) {
        continue;
      }

      if (segmentsIntersect(points, i, iNext, j, jNext)) {
        throw new RangeError('decomposeToConvexParts: the outline intersects itself; only simple polygons can be decomposed.');
      }
    }
  }
};

/** `true` when segments `a→b` and `c→d` share any point, touching included. */
const segmentsIntersect = (points: number[], a: number, b: number, c: number, d: number): boolean => {
  const o1 = orientation(points, a, b, c);
  const o2 = orientation(points, a, b, d);
  const o3 = orientation(points, c, d, a);
  const o4 = orientation(points, c, d, b);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  return (
    (o1 === 0 && onSegment(points, a, b, c)) ||
    (o2 === 0 && onSegment(points, a, b, d)) ||
    (o3 === 0 && onSegment(points, c, d, a)) ||
    (o4 === 0 && onSegment(points, c, d, b))
  );
};

/** Sign of the turn `a → b → c`: `1` left, `-1` right, `0` collinear. */
const orientation = (points: number[], a: number, b: number, c: number): number => {
  const cross = (points[b * 2]! - points[a * 2]!) * (points[c * 2 + 1]! - points[a * 2 + 1]!) - (points[b * 2 + 1]! - points[a * 2 + 1]!) * (points[c * 2]! - points[a * 2]!);
  const scale = Math.hypot(points[b * 2]! - points[a * 2]!, points[b * 2 + 1]! - points[a * 2 + 1]!) * Math.hypot(points[c * 2]! - points[a * 2]!, points[c * 2 + 1]! - points[a * 2 + 1]!);

  if (scale === 0 || Math.abs(cross) <= collinearEpsilon * scale) {
    return 0;
  }

  return cross > 0 ? 1 : -1;
};

/** `true` when `p` lies within the bounding box of the collinear segment `a→b`. */
const onSegment = (points: number[], a: number, b: number, p: number): boolean =>
  points[p * 2]! >= Math.min(points[a * 2]!, points[b * 2]!) - weldEpsilon &&
  points[p * 2]! <= Math.max(points[a * 2]!, points[b * 2]!) + weldEpsilon &&
  points[p * 2 + 1]! >= Math.min(points[a * 2 + 1]!, points[b * 2 + 1]!) - weldEpsilon &&
  points[p * 2 + 1]! <= Math.max(points[a * 2 + 1]!, points[b * 2 + 1]!) + weldEpsilon;

/**
 * Hertel-Mehlhorn: start from the triangulation and drop every internal
 * diagonal whose two faces merge into a still-convex polygon. Diagonals are
 * visited in a fixed key order, so the outcome depends only on the cleaned
 * input.
 */
const mergeTriangles = (points: number[], indices: Uint32Array, degenerateArea: number): number[][] => {
  const cycles = new Map<number, number[]>();
  const owners = new Map<number, number[]>();
  // Union-find over part ids: a merged part keeps the lower id, and every
  // diagonal recorded against the absorbed one resolves through here.
  const parent: number[] = [];

  const find = (id: number): number => {
    let root = id;

    while (parent[root] !== root) {
      root = parent[root]!;
    }

    return root;
  };

  const stride = points.length / 2;
  const diagonalKey = (a: number, b: number): number => (a < b ? a * stride + b : b * stride + a);

  for (let t = 0; t < indices.length; t += 3) {
    const id = t / 3;
    const cycle = [indices[t]!, indices[t + 1]!, indices[t + 2]!];

    if (Math.abs(cycleArea(points, cycle)) <= degenerateArea) {
      continue;
    }

    parent[id] = id;
    cycles.set(id, cycle);

    for (let e = 0; e < 3; e++) {
      const key = diagonalKey(cycle[e]!, cycle[(e + 1) % 3]!);
      const owner = owners.get(key);

      if (owner === undefined) {
        owners.set(key, [id]);
      } else {
        owner.push(id);
      }
    }
  }

  for (const key of [...owners.keys()].sort((x, y) => x - y)) {
    const owner = owners.get(key)!;

    if (owner.length !== 2) {
      continue;
    }

    const rootA = find(owner[0]!);
    const rootB = find(owner[1]!);

    if (rootA === rootB) {
      continue;
    }

    const cycleA = cycles.get(rootA)!;
    const cycleB = cycles.get(rootB)!;
    const merged = mergeAcross(points, cycleA, cycleB, Math.floor(key / stride), key % stride);

    if (merged === null) {
      continue;
    }

    const keep = rootA < rootB ? rootA : rootB;
    const drop = rootA < rootB ? rootB : rootA;

    cycles.set(keep, merged);
    cycles.delete(drop);
    parent[drop] = keep;
  }

  return [...cycles.values()];
};

/**
 * Join two convex cycles across the shared edge between `u` and `v`, or `null`
 * when the union would not be strictly convex. Rejecting a merely collinear
 * junction is deliberate: the resulting part is handed to `PolygonShape`, which
 * refuses collinear edges.
 */
const mergeAcross = (points: number[], cycleA: number[], cycleB: number[], u: number, v: number): number[] | null => {
  // Both cycles are counter-clockwise and share the undirected edge, so exactly
  // one of them traverses it as `a → b` and the other as `b → a`.
  let a = u;
  let b = v;
  let start = directedEdgeIndex(cycleA, a, b);

  if (start === -1) {
    a = v;
    b = u;
    start = directedEdgeIndex(cycleA, a, b);
  }

  const back = start === -1 ? -1 : directedEdgeIndex(cycleB, b, a);

  if (start === -1 || back === -1) {
    return null;
  }

  // Walk A once starting at b (so it ends on a), then splice in B's vertices
  // strictly between a and b.
  const merged: number[] = [];

  for (let i = 0; i < cycleA.length; i++) {
    merged.push(cycleA[(start + 1 + i) % cycleA.length]!);
  }

  for (let i = 2; i < cycleB.length; i++) {
    merged.push(cycleB[(back + i) % cycleB.length]!);
  }

  return isCycleStrictlyConvex(points, merged) ? merged : null;
};

/** Index of `a` in `cycle` when `b` immediately follows it, else `-1`. */
const directedEdgeIndex = (cycle: number[], a: number, b: number): number => {
  for (let i = 0; i < cycle.length; i++) {
    if (cycle[i] === a && cycle[(i + 1) % cycle.length] === b) {
      return i;
    }
  }

  return -1;
};

const isCycleStrictlyConvex = (points: number[], cycle: number[]): boolean => {
  for (let i = 0; i < cycle.length; i++) {
    const a = cycle[i]!;
    const b = cycle[(i + 1) % cycle.length]!;
    const c = cycle[(i + 2) % cycle.length]!;

    if (orientation(points, a, b, c) <= 0) {
      return false;
    }
  }

  return true;
};

const isStrictlyConvex = (points: number[]): boolean => isCycleStrictlyConvex(points, sequence(points.length / 2));

const sequence = (count: number): number[] => {
  const out: number[] = [];

  for (let i = 0; i < count; i++) {
    out.push(i);
  }

  return out;
};

const toPoints = (points: number[], cycle: number[]): PointLike[] => cycle.map(index => ({ x: points[index * 2]!, y: points[index * 2 + 1]! }));

/** Shoelace signed area of an index cycle over `points`. */
const cycleArea = (points: number[], cycle: number[]): number => {
  let sum = 0;

  for (let i = 0; i < cycle.length; i++) {
    const a = cycle[i]!;
    const b = cycle[(i + 1) % cycle.length]!;

    sum += points[a * 2]! * points[b * 2 + 1]! - points[b * 2]! * points[a * 2 + 1]!;
  }

  return sum / 2;
};

/** Shoelace signed area of a flat point ring; positive is counter-clockwise. */
const signedArea = (points: number[]): number => {
  const count = points.length / 2;
  let sum = 0;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;

    sum += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!;
  }

  return sum / 2;
};

const reverseWinding = (points: number[]): void => {
  const count = points.length / 2;

  for (let i = 0; i < Math.floor(count / 2); i++) {
    const j = count - 1 - i;
    const ix = points[i * 2]!;
    const iy = points[i * 2 + 1]!;

    points[i * 2] = points[j * 2]!;
    points[i * 2 + 1] = points[j * 2 + 1]!;
    points[j * 2] = ix;
    points[j * 2 + 1] = iy;
  }
};
