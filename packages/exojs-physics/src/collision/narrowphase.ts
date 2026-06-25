import type { CollisionProxy } from './CollisionProxy';
import type { Manifold } from './Manifold';

const eps = 1e-9;

/**
 * Generate the contact manifold for `a` vs `b`, writing into `manifold` and
 * returning `true` when the colliders touch. The manifold normal is oriented
 * from `a` toward `b`. Dispatches on shape pair; polygon/circle is handled by
 * the circle/polygon routine with a `flip` so the normal stays `a → b`.
 */
export const collide = (a: CollisionProxy, b: CollisionProxy, manifold: Manifold): boolean => {
  manifold.reset();

  const ta = a.shape.type;
  const tb = b.shape.type;

  if (ta === 'circle') {
    return tb === 'circle' ? collideCircles(a, b, manifold) : collideCirclePolygon(a, b, manifold, false);
  }

  return tb === 'circle' ? collideCirclePolygon(b, a, manifold, true) : collidePolygons(a, b, manifold);
};

// radiusOf/countOf are only ever called after the `collide` dispatch has matched
// the shape kind, so the discriminant always holds; the fallback is unreachable
// but keeps these allocation-free helpers cast-free and type-safe.
const radiusOf = (collider: CollisionProxy): number => (collider.shape.type === 'circle' ? collider.shape.radius : 0);
const countOf = (collider: CollisionProxy): number => (collider.shape.type === 'polygon' ? collider.shape.count : 0);

const collideCircles = (a: CollisionProxy, b: CollisionProxy, manifold: Manifold): boolean => {
  const ca = a.worldCenter;
  const cb = b.worldCenter;
  const ra = radiusOf(a);
  const rb = radiusOf(b);

  let nx = cb.x - ca.x;
  let ny = cb.y - ca.y;
  const rsum = ra + rb;
  const distSq = nx * nx + ny * ny;

  if (distSq > rsum * rsum) {
    return false;
  }

  const dist = Math.sqrt(distSq);

  if (dist > eps) {
    nx /= dist;
    ny /= dist;
  } else {
    nx = 0;
    ny = 1;
  }

  manifold.normalX = nx;
  manifold.normalY = ny;

  const point = manifold.points[0];
  // Midpoint of the two surface contact points.
  point.x = (ca.x + nx * ra + cb.x - nx * rb) * 0.5;
  point.y = (ca.y + ny * ra + cb.y - ny * rb) * 0.5;
  point.penetration = rsum - dist;
  point.id = 0;
  manifold.pointCount = 1;

  return true;
};

/**
 * Circle (the `circle` collider) vs polygon. Produces the normal pointing from
 * the circle toward the polygon; when `flip` is set (the polygon is collider A),
 * the normal is negated so it stays `a → b`.
 */
const collideCirclePolygon = (circle: CollisionProxy, polygon: CollisionProxy, manifold: Manifold, flip: boolean): boolean => {
  const c = circle.worldCenter;
  const r = radiusOf(circle);
  const verts = polygon.worldVertices;
  const normals = polygon.worldNormals;
  const count = countOf(polygon);

  let maxSep = -Infinity;
  let refEdge = 0;

  for (let i = 0; i < count; i++) {
    // Loop indices are provably in-bounds (0..count-1); the `!` is zero-cost.
    const enx = normals[i * 2]!;
    const eny = normals[i * 2 + 1]!;
    const evx = verts[i * 2]!;
    const evy = verts[i * 2 + 1]!;
    const s = enx * (c.x - evx) + eny * (c.y - evy);

    if (s > r) {
      return false;
    }

    if (s > maxSep) {
      maxSep = s;
      refEdge = i;
    }
  }

  // refEdge/j stay in 0..count-1, so these reads are in-bounds too.
  const refNx = normals[refEdge * 2]!;
  const refNy = normals[refEdge * 2 + 1]!;

  let nx: number;
  let ny: number;
  let penetration: number;
  let px: number;
  let py: number;
  let id: number;

  if (maxSep < eps) {
    // Centre inside the polygon: push out along the least-penetrating face.
    nx = -refNx;
    ny = -refNy;
    penetration = r - maxSep;
    px = c.x + nx * r;
    py = c.y + ny * r;
    id = refEdge;
  } else {
    const j = (refEdge + 1) % count;
    const v1x = verts[refEdge * 2]!;
    const v1y = verts[refEdge * 2 + 1]!;
    const v2x = verts[j * 2]!;
    const v2y = verts[j * 2 + 1]!;
    const u1 = (c.x - v1x) * (v2x - v1x) + (c.y - v1y) * (v2y - v1y);
    const u2 = (c.x - v2x) * (v1x - v2x) + (c.y - v2y) * (v1y - v2y);

    if (u1 <= 0) {
      // Nearest feature is vertex v1 (Voronoi corner region).
      const dx = c.x - v1x;
      const dy = c.y - v1y;
      const d2 = dx * dx + dy * dy;

      if (d2 > r * r) {
        return false;
      }

      const d = Math.sqrt(d2);

      nx = d > eps ? -dx / d : -refNx;
      ny = d > eps ? -dy / d : -refNy;
      penetration = r - d;
      px = v1x;
      py = v1y;
      id = refEdge;
    } else if (u2 <= 0) {
      const dx = c.x - v2x;
      const dy = c.y - v2y;
      const d2 = dx * dx + dy * dy;

      if (d2 > r * r) {
        return false;
      }

      const d = Math.sqrt(d2);

      nx = d > eps ? -dx / d : -refNx;
      ny = d > eps ? -dy / d : -refNy;
      penetration = r - d;
      px = v2x;
      py = v2y;
      id = j;
    } else {
      // Face region.
      nx = -refNx;
      ny = -refNy;
      penetration = r - maxSep;
      px = c.x + nx * r;
      py = c.y + ny * r;
      id = refEdge;
    }
  }

  if (flip) {
    nx = -nx;
    ny = -ny;
  }

  manifold.normalX = nx;
  manifold.normalY = ny;

  const point = manifold.points[0];
  point.x = px;
  point.y = py;
  point.penetration = penetration < 0 ? 0 : penetration;
  point.id = id;
  manifold.pointCount = 1;

  return true;
};

interface ClipVertex {
  x: number;
  y: number;
  id: number;
}

const newClipPair = (): [ClipVertex, ClipVertex] => [
  { x: 0, y: 0, id: 0 },
  { x: 0, y: 0, id: 0 },
];

// Module-local clip scratch reused across collidePolygons calls instead of
// allocating a fresh pair per contact. The narrow phase is single-threaded and
// non-reentrant — a world step calls `collide` strictly sequentially per pair,
// with no nested self-call or async — so module-global scratch is safe and may
// be shared across worlds (world-isolation.test.ts guards the multi-world
// invariant). The three pairs MUST stay separate: incident → clipped1 →
// clipped2 are simultaneously live (each clip reads the previous clip's output).
const _incidentScratch = newClipPair();
const _clipped1Scratch = newClipPair();
const _clipped2Scratch = newClipPair();

interface Separation {
  separation: number;
  edge: number;
}

// Two separate scratches: collidePolygons holds sepA and sepB at the same time.
const _sepA: Separation = { separation: 0, edge: 0 };
const _sepB: Separation = { separation: 0, edge: 0 };

/** Max separation of `b` from any face of `a`, with the supporting face index. Writes into and returns `out` (allocation-free). */
const findMaxSeparation = (a: CollisionProxy, b: CollisionProxy, out: Separation): Separation => {
  const av = a.worldVertices;
  const an = a.worldNormals;
  const ac = countOf(a);
  const bv = b.worldVertices;
  const bc = countOf(b);

  let best = -Infinity;
  let bestEdge = 0;

  for (let i = 0; i < ac; i++) {
    // i in 0..ac-1 and j in 0..bc-1, so every read below is in-bounds.
    const nx = an[i * 2]!;
    const ny = an[i * 2 + 1]!;
    const vx = av[i * 2]!;
    const vy = av[i * 2 + 1]!;

    // Support of b along -n = vertex of b minimising dot(n, vertex).
    let minDot = Infinity;
    let sx = 0;
    let sy = 0;

    for (let j = 0; j < bc; j++) {
      const bjx = bv[j * 2]!;
      const bjy = bv[j * 2 + 1]!;
      const d = nx * bjx + ny * bjy;

      if (d < minDot) {
        minDot = d;
        sx = bjx;
        sy = bjy;
      }
    }

    const separation = nx * (sx - vx) + ny * (sy - vy);

    if (separation > best) {
      best = separation;
      bestEdge = i;
    }
  }

  out.separation = best;
  out.edge = bestEdge;

  return out;
};

/** Incident face of `inc` = the face most anti-parallel to the reference normal. */
const findIncidentFace = (refNx: number, refNy: number, inc: CollisionProxy, out: [ClipVertex, ClipVertex]): void => {
  const iv = inc.worldVertices;
  const inrm = inc.worldNormals;
  const ic = countOf(inc);

  let minDot = Infinity;
  let idx = 0;

  for (let i = 0; i < ic; i++) {
    const inx = inrm[i * 2]!;
    const iny = inrm[i * 2 + 1]!;
    const d = refNx * inx + refNy * iny;

    if (d < minDot) {
      minDot = d;
      idx = i;
    }
  }

  const j = (idx + 1) % ic;

  // idx/j in 0..ic-1; reads in-bounds. out is a fixed 2-tuple.
  out[0].x = iv[idx * 2]!;
  out[0].y = iv[idx * 2 + 1]!;
  out[0].id = idx;
  out[1].x = iv[j * 2]!;
  out[1].y = iv[j * 2 + 1]!;
  out[1].id = j;
};

/** Clip the 2-vertex segment `input` to the half-plane `dot(n, p) ≤ offset`. */
const clipSegment = (
  nx: number,
  ny: number,
  offset: number,
  input: readonly [ClipVertex, ClipVertex],
  output: [ClipVertex, ClipVertex],
  syntheticId: number,
): number => {
  // input/output are fixed 2-tuples; count never exceeds 2 (two boundary
  // copies, or one copy plus the guarded intersection), so output[0]/output[1]
  // are the only slots written and both always exist.
  const in0 = input[0];
  const in1 = input[1];
  let count = 0;
  const d1 = nx * in0.x + ny * in0.y - offset;
  const d2 = nx * in1.x + ny * in1.y - offset;

  if (d1 <= 0) {
    copyClip(in0, count === 0 ? output[0] : output[1]);
    count++;
  }

  if (d2 <= 0) {
    copyClip(in1, count === 0 ? output[0] : output[1]);
    count++;
  }

  if (d1 * d2 < 0 && count < 2) {
    const alpha = d1 / (d1 - d2);
    const target = count === 0 ? output[0] : output[1];

    target.x = in0.x + alpha * (in1.x - in0.x);
    target.y = in0.y + alpha * (in1.y - in0.y);
    target.id = syntheticId;
    count++;
  }

  return count;
};

const copyClip = (from: ClipVertex, to: ClipVertex): void => {
  to.x = from.x;
  to.y = from.y;
  to.id = from.id;
};

const encodeId = (flip: boolean, refEdge: number, incidentId: number): number =>
  (flip ? 1 << 20 : 0) | ((refEdge & 0xff) << 12) | (incidentId & 0xfff);

/** Convex polygon vs convex polygon: SAT reference face + Sutherland-Hodgman clip. */
const collidePolygons = (a: CollisionProxy, b: CollisionProxy, manifold: Manifold): boolean => {
  const sepA = findMaxSeparation(a, b, _sepA);

  if (sepA.separation >= 0) {
    return false;
  }

  const sepB = findMaxSeparation(b, a, _sepB);

  if (sepB.separation >= 0) {
    return false;
  }

  let ref: CollisionProxy;
  let inc: CollisionProxy;
  let refEdge: number;
  let flip: boolean;

  // Bias toward keeping A as the reference for stability (reduces ref/incident
  // role flapping when a body rocks slightly — gate SG-M3).
  if (sepA.separation >= sepB.separation * 0.95 + sepA.separation * 0.01) {
    ref = a;
    inc = b;
    refEdge = sepA.edge;
    flip = false;
  } else {
    ref = b;
    inc = a;
    refEdge = sepB.edge;
    flip = true;
  }

  const rv = ref.worldVertices;
  const rn = ref.worldNormals;
  const rc = countOf(ref);
  const i2 = (refEdge + 1) % rc;
  // refEdge/i2 in 0..rc-1, so these reads are in-bounds.
  const v1x = rv[refEdge * 2]!;
  const v1y = rv[refEdge * 2 + 1]!;
  const v2x = rv[i2 * 2]!;
  const v2y = rv[i2 * 2 + 1]!;
  const refNx = rn[refEdge * 2]!;
  const refNy = rn[refEdge * 2 + 1]!;

  const incident = _incidentScratch;
  findIncidentFace(refNx, refNy, inc, incident);

  // Reference-face tangent (the side-plane direction).
  let tx = v2x - v1x;
  let ty = v2y - v1y;
  const tl = Math.hypot(tx, ty);
  tx /= tl;
  ty /= tl;

  const negSide = -(tx * v1x + ty * v1y);
  const posSide = tx * v2x + ty * v2y;

  const clipped1 = _clipped1Scratch;

  if (clipSegment(-tx, -ty, negSide, incident, clipped1, encodeId(flip, refEdge, 0xffe)) < 2) {
    return false;
  }

  const clipped2 = _clipped2Scratch;

  if (clipSegment(tx, ty, posSide, clipped1, clipped2, encodeId(flip, refEdge, 0xfff)) < 2) {
    return false;
  }

  manifold.normalX = flip ? -refNx : refNx;
  manifold.normalY = flip ? -refNy : refNy;

  const refC = refNx * v1x + refNy * v1y;
  const points = manifold.points;
  let cp = 0;

  for (let k = 0; k < 2; k++) {
    // clipped2 is a fixed 2-tuple; k in {0,1} so the clip vertex always exists.
    const cv = k === 0 ? clipped2[0] : clipped2[1];
    const separation = refNx * cv.x + refNy * cv.y - refC;

    if (separation <= 0) {
      // cp reaches at most 2 (one per clip vertex); points[0]/points[1] exist.
      const point = cp === 0 ? points[0] : points[1];
      point.x = cv.x;
      point.y = cv.y;
      point.penetration = -separation;
      point.id = encodeId(flip, refEdge, cv.id);
      cp++;
    }
  }

  manifold.pointCount = cp;

  return cp > 0;
};

/**
 * Boolean overlap test (no manifold) used by sensors and shape-overlap queries.
 * Exact for the circle/circle, circle/polygon and polygon/polygon pairs.
 */
export const testOverlap = (a: CollisionProxy, b: CollisionProxy): boolean => {
  const ta = a.shape.type;
  const tb = b.shape.type;

  if (ta === 'circle') {
    if (tb === 'circle') {
      const ca = a.worldCenter;
      const cb = b.worldCenter;
      const rsum = radiusOf(a) + radiusOf(b);
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;

      return dx * dx + dy * dy <= rsum * rsum;
    }

    return circlePolygonOverlap(a, b);
  }

  if (tb === 'circle') {
    return circlePolygonOverlap(b, a);
  }

  return findMaxSeparation(a, b, _sepA).separation < 0 && findMaxSeparation(b, a, _sepB).separation < 0;
};

const circlePolygonOverlap = (circle: CollisionProxy, polygon: CollisionProxy): boolean => {
  const c = circle.worldCenter;
  const r = radiusOf(circle);
  const verts = polygon.worldVertices;
  const normals = polygon.worldNormals;
  const count = countOf(polygon);

  let maxSep = -Infinity;
  let refEdge = 0;

  for (let i = 0; i < count; i++) {
    // Loop indices are provably in-bounds (0..count-1); the `!` is zero-cost.
    const enx = normals[i * 2]!;
    const eny = normals[i * 2 + 1]!;
    const evx = verts[i * 2]!;
    const evy = verts[i * 2 + 1]!;
    const s = enx * (c.x - evx) + eny * (c.y - evy);

    if (s > r) {
      return false;
    }

    if (s > maxSep) {
      maxSep = s;
      refEdge = i;
    }
  }

  if (maxSep < eps) {
    return true;
  }

  const j = (refEdge + 1) % count;
  const v1x = verts[refEdge * 2]!;
  const v1y = verts[refEdge * 2 + 1]!;
  const v2x = verts[j * 2]!;
  const v2y = verts[j * 2 + 1]!;
  const u1 = (c.x - v1x) * (v2x - v1x) + (c.y - v1y) * (v2y - v1y);
  const u2 = (c.x - v2x) * (v1x - v2x) + (c.y - v2y) * (v1y - v2y);

  if (u1 <= 0) {
    const dx = c.x - v1x;
    const dy = c.y - v1y;

    return dx * dx + dy * dy <= r * r;
  }

  if (u2 <= 0) {
    const dx = c.x - v2x;
    const dy = c.y - v2y;

    return dx * dx + dy * dy <= r * r;
  }

  return maxSep <= r;
};
