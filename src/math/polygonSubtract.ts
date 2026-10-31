/** One connected piece of a subtraction result. @internal */
export interface SubtractedPolygon {
  /** Counter-clockwise outer ring as flat (x, y) pairs. */
  readonly outer: number[];
  /** Clockwise hole rings inside `outer`. */
  readonly holes: number[][];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface DirectedEdge {
  readonly from: number;
  readonly to: number;
  used: boolean;
}

/**
 * Subtract the union of `cuts` from `base`. Every ring is a closed, simple
 * polygon given as flat (x, y) pairs in either winding; rings with fewer than
 * three vertices or no area are ignored.
 *
 * Every edge is split where it meets an edge of another ring, collinear
 * overlaps included. A split piece is part of the result outline exactly when
 * the region `inside(base) && !inside(any cut)` lies on one side of it and not
 * the other, which handles shared edges, overlapping cuts and cuts that split
 * the base without special cases. The pieces are then chained into rings with
 * the region on their left.
 *
 * shortcut: every edge pair is tested for intersection (quadratic in the edge
 * count); switch to a sweep line once shapes reach thousands of edges.
 * @internal
 */
export const subtractPolygons = (base: readonly number[], cuts: ReadonlyArray<readonly number[]>): SubtractedPolygon[] => {
  const rings = [base, ...cuts].map(toPoints);

  if (rings[0]!.length < 3 || Math.abs(areaOf(rings[0]!)) === 0) {
    return [];
  }

  const cutRings = rings.slice(1).filter(ring => ring.length >= 3 && Math.abs(areaOf(ring)) > 0);
  const allRings = [rings[0]!, ...cutRings];

  if (cutRings.length === 0) {
    return [{ outer: flatten(orient(rings[0]!, true)), holes: [] }];
  }

  const scale = extentOf(allRings);
  const snap = scale * 1e-9;
  const probe = scale * 1e-6;
  const points = new PointTable(snap);
  const inRegion = (x: number, y: number): boolean => insideRing(x, y, allRings[0]!) && !cutRings.some(ring => insideRing(x, y, ring));
  const segments = allRings.flatMap((ring, ringIndex) =>
    ring.map((start, i) => ({ ringIndex, start, end: ring[(i + 1) % ring.length]!, params: [0, 1] })),
  );

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i]!.ringIndex !== segments[j]!.ringIndex) {
        collectIntersections(segments[i]!, segments[j]!);
      }
    }
  }

  const seen = new Set<string>();
  const edges: DirectedEdge[] = [];

  for (const segment of segments) {
    const { start, end } = segment;
    const ids = [...new Set(segment.params)]
      .sort((a, b) => a - b)
      .map(t => points.id(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t));

    for (let k = 0; k + 1 < ids.length; k++) {
      const a = ids[k]!;
      const b = ids[k + 1]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;

      if (a === b || seen.has(key)) {
        continue;
      }

      seen.add(key);

      const pa = points.at(a);
      const pb = points.at(b);
      const length = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const nx = (-(pb.y - pa.y) / length) * probe;
      const ny = ((pb.x - pa.x) / length) * probe;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const left = inRegion(mx + nx, my + ny);
      const right = inRegion(mx - nx, my - ny);

      if (left && !right) {
        edges.push({ from: a, to: b, used: false });
      } else if (right && !left) {
        edges.push({ from: b, to: a, used: false });
      }
    }
  }

  return assemble(chainRings(edges, points), points, probe);
};

const toPoints = (ring: readonly number[]): Point[] => {
  const points: Point[] = [];

  for (let i = 0; i + 1 < ring.length; i += 2) {
    const point = { x: ring[i]!, y: ring[i + 1]! };
    const last = points[points.length - 1];

    if (last === undefined || last.x !== point.x || last.y !== point.y) {
      points.push(point);
    }
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (points.length > 1 && first!.x === last!.x && first!.y === last!.y) {
    points.pop();
  }

  return points;
};

const flatten = (ring: readonly Point[]): number[] => ring.flatMap(point => [point.x, point.y]);

const areaOf = (ring: readonly Point[]): number => {
  let sum = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;

    sum += a.x * b.y - b.x * a.y;
  }

  return sum / 2;
};

const orient = (ring: readonly Point[], counterClockwise: boolean): Point[] =>
  areaOf(ring) > 0 === counterClockwise ? [...ring] : [...ring].reverse();

const extentOf = (rings: ReadonlyArray<readonly Point[]>): number => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of rings) {
    for (const { x, y } of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return Math.max(maxX - minX, maxY - minY, Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY), 1e-12);
};

const insideRing = (x: number, y: number, ring: readonly Point[]): boolean => {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;

    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }

  return inside;
};

interface Segment {
  readonly start: Point;
  readonly end: Point;
  readonly params: number[];
}

const parameterEpsilon = 1e-12;

const collectIntersections = (first: Segment, second: Segment): void => {
  const p = first.start;
  const rx = first.end.x - p.x;
  const ry = first.end.y - p.y;
  const q = second.start;
  const sx = second.end.x - q.x;
  const sy = second.end.y - q.y;
  const qpx = q.x - p.x;
  const qpy = q.y - p.y;
  const denominator = rx * sy - ry * sx;
  const lengths = Math.hypot(rx, ry) * Math.hypot(sx, sy);

  if (Math.abs(denominator) > parameterEpsilon * lengths) {
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;

    if (t >= -parameterEpsilon && t <= 1 + parameterEpsilon && u >= -parameterEpsilon && u <= 1 + parameterEpsilon) {
      first.params.push(clamp01(t));
      second.params.push(clamp01(u));
    }

    return;
  }

  // Parallel: only collinear overlaps matter, and they split each segment at the other's endpoints.
  if (Math.abs(qpx * ry - qpy * rx) > parameterEpsilon * lengths) {
    return;
  }

  addProjection(first, second.start);
  addProjection(first, second.end);
  addProjection(second, first.start);
  addProjection(second, first.end);
};

const addProjection = (segment: Segment, point: Point): void => {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const t = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / (dx * dx + dy * dy);

  if (t > parameterEpsilon && t < 1 - parameterEpsilon) {
    segment.params.push(t);
  }
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Merges points closer than `snap` so split pieces meeting at an intersection share one vertex. */
class PointTable {
  private readonly _points: Point[] = [];
  private readonly _cells = new Map<string, number[]>();

  public constructor(private readonly _snap: number) {}

  public id(x: number, y: number): number {
    const cx = Math.floor(x / this._snap);
    const cy = Math.floor(y / this._snap);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of this._cells.get(`${cx + dx}|${cy + dy}`) ?? []) {
          const point = this._points[id]!;

          if (Math.abs(point.x - x) <= this._snap && Math.abs(point.y - y) <= this._snap) {
            return id;
          }
        }
      }
    }

    const id = this._points.length;
    const key = `${cx}|${cy}`;

    this._points.push({ x, y });
    this._cells.set(key, [...(this._cells.get(key) ?? []), id]);

    return id;
  }

  public at(id: number): Point {
    return this._points[id]!;
  }
}

/**
 * Chain directed edges into closed rings. Where several edges leave one
 * vertex, the sharpest left turn keeps the region tightly on the left, so
 * pieces that only touch at a vertex come out as separate rings.
 */
const chainRings = (edges: DirectedEdge[], points: PointTable): number[][] => {
  const outgoing = new Map<number, DirectedEdge[]>();

  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }

  const rings: number[][] = [];

  for (const startEdge of edges) {
    if (startEdge.used) {
      continue;
    }

    const ring: number[] = [];
    let edge: DirectedEdge | null = startEdge;

    while (edge !== null && !edge.used) {
      edge.used = true;
      ring.push(edge.from);

      if (edge.to === startEdge.from) {
        rings.push(ring);
        break;
      }

      const from = points.at(edge.from);
      const at = points.at(edge.to);
      const inX = at.x - from.x;
      const inY = at.y - from.y;
      let best: DirectedEdge | null = null;
      let bestTurn = -Infinity;

      for (const candidate of outgoing.get(edge.to) ?? []) {
        if (candidate.used) {
          continue;
        }

        const to = points.at(candidate.to);
        const outX = to.x - at.x;
        const outY = to.y - at.y;
        const turn = Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY);

        if (turn > bestTurn) {
          bestTurn = turn;
          best = candidate;
        }
      }

      edge = best;
    }
  }

  return rings;
};

/** Drop collinear pass-through vertices, then pair every hole with the smallest outer ring that contains it. */
const assemble = (rings: number[][], points: PointTable, probe: number): SubtractedPolygon[] => {
  const outers: Array<{ ring: Point[]; area: number; holes: number[][] }> = [];
  const holes: Point[][] = [];

  for (const ids of rings) {
    const ring = simplify(ids.map(id => points.at(id)));

    if (ring.length < 3) {
      continue;
    }

    const area = areaOf(ring);

    if (area > 0) {
      outers.push({ ring, area, holes: [] });
    } else if (area < 0) {
      holes.push(ring);
    }
  }

  outers.sort((a, b) => a.area - b.area);

  for (const hole of holes) {
    // A point just left of a hole edge lies in the region, so it is inside
    // exactly the outer ring this hole belongs to, even if the hole touches it.
    const a = hole[0]!;
    const b = hole[1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const x = (a.x + b.x) / 2 - ((b.y - a.y) / length) * probe;
    const y = (a.y + b.y) / 2 + ((b.x - a.x) / length) * probe;
    const owner = outers.find(outer => insideRing(x, y, outer.ring));

    owner?.holes.push(flatten(hole));
  }

  return outers.map(outer => ({ outer: flatten(outer.ring), holes: outer.holes }));
};

const simplify = (ring: readonly Point[]): Point[] => {
  const result = [...ring];
  let changed = true;

  while (changed && result.length >= 3) {
    changed = false;

    for (let i = 0; i < result.length && result.length >= 3; i++) {
      const a = result[(i + result.length - 1) % result.length]!;
      const b = result[i]!;
      const c = result[(i + 1) % result.length]!;
      const crossValue = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;

      if (Math.abs(crossValue) <= 1e-12 * scale && forward) {
        result.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }

  return result;
};
