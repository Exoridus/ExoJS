import type { PointLike } from '@codexo/exojs';

import { ChainEdgeShape } from '../shapes/ChainEdgeShape';
import { chainEdgeAdmits } from './chainAdjacency';
import type { CollisionProxy } from './CollisionProxy';
import type { PairTable } from './dispatch';
import { needsFlip, symmetricEntry, symmetricTable } from './dispatch';
import type { Manifold } from './Manifold';
import { closestPointOnSegment, pointSegmentDistanceSquared, segmentSegmentDistanceSquared } from './segments';

const eps = 1e-9;

/** Reused closest-point sink; the narrow phase is single-threaded and non-reentrant. */
const _segmentScratch: PointLike = { x: 0, y: 0 };

/**
 * Solves one unordered shape pair. `a` is always the operand of the lower shape
 * kind; `flip` is `true` when the caller's operands were swapped to get there,
 * and the routine must reverse the manifold normal so it still points from the
 * caller's `a` toward its `b`.
 */
type CollidePair = (a: CollisionProxy, b: CollisionProxy, manifold: Manifold, flip: boolean) => boolean;

/** Boolean form of {@link CollidePair}; no normal, so no flip to honour. */
type OverlapPair = (a: CollisionProxy, b: CollisionProxy) => boolean;

/**
 * Generate the contact manifold for `a` vs `b`, writing into `manifold` and
 * returning `true` when the colliders touch. The manifold normal is oriented
 * from `a` toward `b`.
 *
 * A pair with no entry in the table is deliberately unsupported and reports no
 * contact rather than an approximation.
 */
export const collide = (a: CollisionProxy, b: CollisionProxy, manifold: Manifold): boolean => {
  manifold.reset();

  const ta = a.shape.type;
  const tb = b.shape.type;
  const solver = symmetricEntry(collideTable, ta, tb);

  if (solver === undefined) {
    return false;
  }

  const touching = needsFlip(ta, tb) ? solver(b, a, manifold, true) : solver(a, b, manifold, false);

  if (!touching) {
    return false;
  }

  // The manifold normal points a → b, so it is the direction `a` pushes `b`
  // away along; from b's side the outward direction is its negation.
  if (!chainEdgeAdmits(a, manifold.normalX, manifold.normalY) || !chainEdgeAdmits(b, -manifold.normalX, -manifold.normalY)) {
    manifold.reset();

    return false;
  }

  return true;
};

// Both helpers stay cast-free and allocation-free. A capsule is a two-vertex
// ring with a radius, which is exactly why it shares the polygon routines: the
// ring supplies `count` and `worldVertices`/`worldNormals`, the radius rounds
// the result off.
const radiusOf = (collider: CollisionProxy): number =>
  collider.shape.type === 'circle' || collider.shape.type === 'capsule' ? collider.shape.radius : 0;

const countOf = (collider: CollisionProxy): number => {
  switch (collider.shape.type) {
    case 'polygon':
      return collider.shape.count;
    case 'capsule':
    case 'segment':
      return 2;
    case 'circle':
    case 'chain':
      // A chain is never an operand here - it is solved through its edge proxies.
      return 0;
  }
};

const collideCircles: CollidePair = (a, b, manifold) => {
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
const collideCirclePolygon: CollidePair = (circle, polygon, manifold, flip) => {
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
// non-reentrant - a world step calls `collide` strictly sequentially per pair,
// with no nested self-call or async - so module-global scratch is safe and may
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

/**
 * Convex ring vs convex ring: SAT reference face + Sutherland-Hodgman clip, with
 * each operand allowed a radius that rounds its outline off.
 *
 * The separations the SAT computes are between the two **cores**; the radii only
 * move where touching begins, and since both candidate axes shift by the same
 * sum, the reference face the SAT picks is unaffected. A capsule is a two-vertex
 * core with a radius and a polygon a many-vertex core without one, so
 * polygon/polygon, capsule/polygon and capsule/capsule are all this one routine.
 */
const collideRoundedPolygons: CollidePair = (a, b, manifold, callerFlip) => {
  const totalRadius = radiusOf(a) + radiusOf(b);
  const sepA = findMaxSeparation(a, b, _sepA);

  if (sepA.separation >= totalRadius) {
    return false;
  }

  const sepB = findMaxSeparation(b, a, _sepB);

  if (sepB.separation >= totalRadius) {
    return false;
  }

  let ref: CollisionProxy;
  let inc: CollisionProxy;
  let refEdge: number;
  // Whether the REFERENCE role went to `b`. Distinct from `callerFlip`, which
  // records that the caller's own operands were swapped to reach the canonical
  // order; the final normal has to undo both.
  let refSwapped: boolean;

  // Bias toward keeping A as the reference for stability (reduces ref/incident
  // role flapping when a body rocks slightly).
  if (sepA.separation >= sepB.separation * 0.95 + sepA.separation * 0.01) {
    ref = a;
    inc = b;
    refEdge = sepA.edge;
    refSwapped = false;
  } else {
    ref = b;
    inc = a;
    refEdge = sepB.edge;
    refSwapped = true;
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
  // sqrt(x²+y²) over Math.hypot - avoids hypot's variadic/internal-allocation
  // path on the narrow-phase hot path; the operands are bounded edge lengths,
  // so the overflow protection hypot adds is not needed here.
  const tl = Math.sqrt(tx * tx + ty * ty);
  tx /= tl;
  ty /= tl;

  const negSide = -(tx * v1x + ty * v1y);
  const posSide = tx * v2x + ty * v2y;

  const clipped1 = _clipped1Scratch;
  const flipNormal = refSwapped !== callerFlip;

  if (clipSegment(-tx, -ty, negSide, incident, clipped1, encodeId(refSwapped, refEdge, 0xffe)) < 2) {
    return collideCoreEnds(v1x, v1y, v2x, v2y, ref, incident, inc, totalRadius, flipNormal, encodeId(refSwapped, refEdge, 0xffd), manifold);
  }

  const clipped2 = _clipped2Scratch;

  if (clipSegment(tx, ty, posSide, clipped1, clipped2, encodeId(refSwapped, refEdge, 0xfff)) < 2) {
    return collideCoreEnds(v1x, v1y, v2x, v2y, ref, incident, inc, totalRadius, flipNormal, encodeId(refSwapped, refEdge, 0xffd), manifold);
  }

  manifold.normalX = flipNormal ? -refNx : refNx;
  manifold.normalY = flipNormal ? -refNy : refNy;

  const refC = refNx * v1x + refNy * v1y;
  const incidentRadius = radiusOf(inc);
  const points = manifold.points;
  let cp = 0;

  for (let k = 0; k < 2; k++) {
    // clipped2 is a fixed 2-tuple; k in {0,1} so the clip vertex always exists.
    const cv = k === 0 ? clipped2[0] : clipped2[1];
    const separation = refNx * cv.x + refNy * cv.y - refC;

    if (separation <= totalRadius) {
      // The clip vertex lies on the incident CORE; pulling it back along the
      // reference normal by the incident radius puts it on that shape's real
      // surface. A radius-free incident polygon shifts by zero, so the point is
      // the clip vertex exactly as it was before capsules existed.
      // cp reaches at most 2 (one per clip vertex); points[0]/points[1] exist.
      const point = cp === 0 ? points[0] : points[1];
      point.x = cv.x - refNx * incidentRadius;
      point.y = cv.y - refNy * incidentRadius;
      point.penetration = totalRadius - separation;
      point.id = encodeId(refSwapped, refEdge, cv.id);
      cp++;
    }
  }

  if (cp === 0) {
    // Both clipped points lie beyond the rounded reference face, yet the
    // incident face's core end can still be within reach of a reference corner.
    return collideCoreEnds(v1x, v1y, v2x, v2y, ref, incident, inc, totalRadius, flipNormal, encodeId(refSwapped, refEdge, 0xffd), manifold);
  }

  manifold.pointCount = cp;

  return true;
};

const _coreRef: PointLike = { x: 0, y: 0 };
const _coreInc: PointLike = { x: 0, y: 0 };

/**
 * Contact between the rounded outlines of a reference edge and an incident
 * face whose cores lie beyond each other's ends, where clipping leaves no
 * point: a capsule's cap resting on a polygon's corner or a chain vertex. The
 * face-normal SAT still counts such a pair as touching, but the contact is
 * between the two closest core points, along the line joining them. Without
 * it a rounded body passing over a corner loses its contact there.
 *
 * A chain vertex only has such a corner where the chain turns away from the
 * body. At a straight or inward join the neighbouring edge's face already
 * holds the contact, and a second one from the vertex would tilt it.
 */
const collideCoreEnds = (
  v1x: number,
  v1y: number,
  v2x: number,
  v2y: number,
  ref: CollisionProxy,
  incident: readonly [ClipVertex, ClipVertex],
  inc: CollisionProxy,
  totalRadius: number,
  flipNormal: boolean,
  id: number,
  manifold: Manifold,
): boolean => {
  const i0 = incident[0];
  const i1 = incident[1];
  const distanceSquared = segmentSegmentDistanceSquared(v1x, v1y, v2x, v2y, i0.x, i0.y, i1.x, i1.y, _coreRef, _coreInc);

  // Cores that touch or cross have no direction between them; clipping owns those.
  if (distanceSquared >= totalRadius * totalRadius || distanceSquared < 1e-12) {
    return false;
  }

  if (!isCornerOf(ref, _coreRef) || !isCornerOf(inc, _coreInc)) {
    return false;
  }

  const distance = Math.sqrt(distanceSquared);
  const nx = (_coreInc.x - _coreRef.x) / distance;
  const ny = (_coreInc.y - _coreRef.y) / distance;
  const incidentRadius = radiusOf(inc);
  const point = manifold.points[0];

  manifold.normalX = flipNormal ? -nx : nx;
  manifold.normalY = flipNormal ? -ny : ny;
  point.x = _coreInc.x - nx * incidentRadius;
  point.y = _coreInc.y - ny * incidentRadius;
  point.penetration = totalRadius - distance;
  point.id = id;
  manifold.pointCount = 1;

  return true;
};

/** Squared distance below which a closest point counts as a segment's endpoint. */
const endpointEpsilonSquared = 1e-12;

/**
 * `false` when `point` is the end of a chain edge whose neighbour continues the
 * surface straight or turns towards the body there; `true` for any other point
 * and any other shape.
 */
const isCornerOf = (proxy: CollisionProxy, point: Readonly<PointLike>): boolean => {
  const shape = proxy.shape;

  if (!(shape instanceof ChainEdgeShape)) {
    return true;
  }

  const vertices = proxy.worldVertices;
  const startX = point.x - vertices[0]!;
  const startY = point.y - vertices[1]!;

  if (startX * startX + startY * startY <= endpointEpsilonSquared) {
    return !shape.hasPrevious || shape.previousSin < -convexTurn;
  }

  const endX = point.x - vertices[2]!;
  const endY = point.y - vertices[3]!;

  if (endX * endX + endY * endY <= endpointEpsilonSquared) {
    return !shape.hasNext || shape.nextSin > convexTurn;
  }

  return true;
};

/** Smallest turn, as the sine between neighbouring edge normals, that makes a chain vertex a corner. */
const convexTurn = 1e-6;

/**
 * Boolean overlap test (no manifold) used by sensors and shape-overlap queries.
 * Exact for every supported pair and in agreement with {@link collide}, except
 * that it ignores chain one-sidedness: a shape behind a chain edge overlaps it.
 * As in {@link collide}, exact tangency counts as overlap for pairs involving a
 * circle and not for the others.
 */
export const testOverlap = (a: CollisionProxy, b: CollisionProxy): boolean => {
  const ta = a.shape.type;
  const tb = b.shape.type;
  const test = symmetricEntry(overlapTable, ta, tb);

  if (test === undefined) {
    return false;
  }

  return needsFlip(ta, tb) ? test(b, a) : test(a, b);
};

const circlesOverlap: OverlapPair = (a, b) => {
  const ca = a.worldCenter;
  const cb = b.worldCenter;
  const rsum = radiusOf(a) + radiusOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;

  return dx * dx + dy * dy <= rsum * rsum;
};

/**
 * The face axes alone are exact only for radius-free operands. Once a radius
 * rounds a core, the separating direction in a vertex region is the line
 * between the two closest core points, which no face axis covers, so cores
 * that are apart are decided by their true distance instead.
 */
const roundedPolygonsOverlap: OverlapPair = (a, b) => {
  const totalRadius = radiusOf(a) + radiusOf(b);
  const separation = Math.max(findMaxSeparation(a, b, _sepA).separation, findMaxSeparation(b, a, _sepB).separation);

  if (separation >= totalRadius) {
    return false;
  }

  // Two spines have no face axis along their length, so even separated
  // collinear spines have zero separation on every face axis.
  if ((separation <= 0 && (countOf(a) > 2 || countOf(b) > 2)) || totalRadius === 0) {
    return true;
  }

  return coreDistanceSquared(a, b) < totalRadius * totalRadius;
};

/**
 * Squared distance between two convex cores that do not overlap: the closest
 * pair always lies on some pair of edges. A two-vertex ring is one segment
 * traversed both ways, so it contributes a single edge.
 */
const coreDistanceSquared = (a: CollisionProxy, b: CollisionProxy): number => {
  const av = a.worldVertices;
  const bv = b.worldVertices;
  const ac = countOf(a);
  const bc = countOf(b);
  const aEdges = ac === 2 ? 1 : ac;
  const bEdges = bc === 2 ? 1 : bc;
  let best = Infinity;

  for (let i = 0; i < aEdges; i++) {
    const i2 = (i + 1) % ac;

    for (let j = 0; j < bEdges; j++) {
      const j2 = (j + 1) % bc;
      const distanceSquared = segmentSegmentDistanceSquared(
        av[i * 2]!,
        av[i * 2 + 1]!,
        av[i2 * 2]!,
        av[i2 * 2 + 1]!,
        bv[j * 2]!,
        bv[j * 2 + 1]!,
        bv[j2 * 2]!,
        bv[j2 * 2 + 1]!,
        _coreRef,
        _coreInc,
      );

      if (distanceSquared < best) {
        best = distanceSquared;
      }
    }
  }

  return best;
};

/**
 * Circle vs capsule: a capsule is every point within its radius of the spine, so
 * this is a circle/circle test against the spine point nearest the circle centre.
 * One contact point - a circle meets a rounded surface in one place, and a second
 * would be invented noise for the solver.
 */
const collideCircleSpine: CollidePair = (circle, spineShape, manifold, flip) => {
  const spine = spineShape.worldVertices;
  const centre = circle.worldCenter;
  const circleRadius = radiusOf(circle);
  const radiusSum = circleRadius + radiusOf(spineShape);

  closestPointOnSegment(centre.x, centre.y, spine[0]!, spine[1]!, spine[2]!, spine[3]!, _segmentScratch);

  let nx = _segmentScratch.x - centre.x;
  let ny = _segmentScratch.y - centre.y;
  const distanceSquared = nx * nx + ny * ny;

  if (distanceSquared > radiusSum * radiusSum) {
    return false;
  }

  const distance = Math.sqrt(distanceSquared);

  if (distance > eps) {
    nx /= distance;
    ny /= distance;
  } else {
    // Centre exactly on the spine: the direction is undefined, so take the
    // capsule's own side normal. It is stable from frame to frame, which an
    // axis-aligned guess would not be.
    nx = spineShape.worldNormals[0]!;
    ny = spineShape.worldNormals[1]!;
  }

  manifold.normalX = flip ? -nx : nx;
  manifold.normalY = flip ? -ny : ny;

  const point = manifold.points[0];
  // Midway between the two surfaces along the contact normal.
  const along = circleRadius + (distance - radiusSum) * 0.5;

  point.x = centre.x + nx * along;
  point.y = centre.y + ny * along;
  point.penetration = radiusSum - distance;
  point.id = 0;
  manifold.pointCount = 1;

  return true;
};

const circleSpineOverlap: OverlapPair = (circle, spineShape) => {
  const spine = spineShape.worldVertices;
  const centre = circle.worldCenter;
  const radiusSum = radiusOf(circle) + radiusOf(spineShape);

  return (
    pointSegmentDistanceSquared(centre.x, centre.y, spine[0]!, spine[1]!, spine[2]!, spine[3]!, _segmentScratch) <= radiusSum * radiusSum
  );
};

const circlePolygonOverlap: OverlapPair = (circle, polygon) => {
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

// Pair tables, built once at module init. Every unordered pair the engine
// supports appears exactly once; anything absent reports no contact.
const collideTable: PairTable<CollidePair> = symmetricTable<CollidePair>([
  ['circle', 'circle', collideCircles],
  ['circle', 'capsule', collideCircleSpine],
  ['circle', 'segment', collideCircleSpine],
  ['circle', 'polygon', collideCirclePolygon],
  ['capsule', 'capsule', collideRoundedPolygons],
  ['capsule', 'segment', collideRoundedPolygons],
  ['capsule', 'polygon', collideRoundedPolygons],
  // segment/segment is deliberately absent - see `collide`.
  ['segment', 'polygon', collideRoundedPolygons],
  ['polygon', 'polygon', collideRoundedPolygons],
]);

const overlapTable: PairTable<OverlapPair> = symmetricTable<OverlapPair>([
  ['circle', 'circle', circlesOverlap],
  ['circle', 'capsule', circleSpineOverlap],
  ['circle', 'segment', circleSpineOverlap],
  ['circle', 'polygon', circlePolygonOverlap],
  ['capsule', 'capsule', roundedPolygonsOverlap],
  ['capsule', 'segment', roundedPolygonsOverlap],
  ['capsule', 'polygon', roundedPolygonsOverlap],
  ['segment', 'polygon', roundedPolygonsOverlap],
  ['polygon', 'polygon', roundedPolygonsOverlap],
]);
