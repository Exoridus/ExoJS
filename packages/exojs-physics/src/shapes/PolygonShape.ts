import type { VectorLike } from '../types';
import { Shape } from './Shape';

/** Vertices closer than this (px) are treated as coincident → degenerate. */
const weldEpsilon = 1e-4;

/**
 * A convex polygon defined by ≥3 local-space vertices. Input vertices may be
 * given in either winding; they are canonicalised to counter-clockwise and the
 * outward edge normals are precomputed. Construction throws on any non-convex,
 * degenerate, or under-specified input — there is no silent repair.
 *
 * Vertices and normals are exposed as flat `[x0, y0, x1, y1, …]` arrays to keep
 * the narrow phase allocation-free; both are frozen.
 */
export class PolygonShape extends Shape {
  public readonly type = 'polygon' as const;

  /** Local-space vertices, CCW, flattened. */
  public readonly vertices: readonly number[];

  /** Outward unit edge normals (edge `i` spans vertex `i → i+1`), flattened. */
  public readonly normals: readonly number[];

  public readonly count: number;
  public readonly boundingRadius: number;
  public readonly area: number;
  public readonly centroidX: number;
  public readonly centroidY: number;
  public readonly unitInertia: number;

  public constructor(vertices: readonly VectorLike[]) {
    super();

    if (vertices.length < 3) {
      throw new RangeError(`PolygonShape: needs at least 3 vertices, received ${vertices.length}.`);
    }

    const points: number[] = [];

    for (const vertex of vertices) {
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
        throw new RangeError(`PolygonShape: vertex has a non-finite component (${vertex.x}, ${vertex.y}).`);
      }

      // Reject coincident consecutive (and wrap-around) vertices.
      const px = points.length >= 2 ? (points[points.length - 2] ?? NaN) : NaN;
      const py = points.length >= 2 ? (points[points.length - 1] ?? NaN) : NaN;

      if (Math.hypot(vertex.x - px, vertex.y - py) < weldEpsilon) {
        continue;
      }

      points.push(vertex.x, vertex.y);
    }

    // Drop a wrap-around duplicate (last ≈ first).
    dropWrapAroundDuplicate(points);

    const count = points.length / 2;

    if (count < 3) {
      throw new RangeError(`PolygonShape: needs at least 3 distinct vertices after welding, received ${count}.`);
    }

    // Canonicalise to CCW (positive signed area). Screen space is +Y down, so a
    // mathematically CCW polygon appears clockwise — the math stays consistent.
    if (signedArea(points) < 0) {
      reverseWinding(points);
    }

    const signed = signedArea(points);

    if (signed <= weldEpsilon) {
      throw new RangeError('PolygonShape: vertices are degenerate (zero/near-zero area).');
    }

    const normals = computeNormals(points);

    assertConvex(points);

    // Area, centroid and inertia via the standard polygon integrals.
    let cx = 0;
    let cy = 0;
    let inertiaOrigin = 0;

    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      // Indices are provably in-bounds (0..count-1 over a length-2*count array);
      // the `!` is zero-cost; a violation would surface as NaN, not a silent 0.
      const ix = points[i * 2]!;
      const iy = points[i * 2 + 1]!;
      const jx = points[j * 2]!;
      const jy = points[j * 2 + 1]!;
      const cross = ix * jy - jx * iy;

      cx += (ix + jx) * cross;
      cy += (iy + jy) * cross;
      inertiaOrigin += cross * (ix * ix + ix * jx + jx * jx + iy * iy + iy * jy + jy * jy);
    }

    const area = signed;
    cx /= 6 * area;
    cy /= 6 * area;

    this.count = count;
    this.vertices = Object.freeze(points);
    this.normals = Object.freeze(normals);
    this.area = area;
    this.centroidX = cx;
    this.centroidY = cy;
    // ∫ r² dA about the origin, then shifted to the centroid (parallel axis).
    this.unitInertia = inertiaOrigin / 12 - area * (cx * cx + cy * cy);
    this.boundingRadius = boundingRadiusOf(points);

    // The vertex/normal arrays are frozen; the instance itself is not, so
    // BoxShape (and any future convex helper) can extend this class.
  }
}

/** Strip a trailing vertex that coincides with the first (wrap-around weld). */
const dropWrapAroundDuplicate = (points: number[]): void => {
  if (points.length < 4) {
    return;
  }

  const firstX = points[0] ?? NaN;
  const firstY = points[1] ?? NaN;
  const lastX = points[points.length - 2] ?? NaN;
  const lastY = points[points.length - 1] ?? NaN;

  if (Math.hypot(firstX - lastX, firstY - lastY) < weldEpsilon) {
    points.length -= 2;
  }
};

/** Signed area (positive = CCW). */
const signedArea = (points: number[]): number => {
  const count = points.length / 2;
  let sum = 0;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const ix = points[i * 2]!;
    const iy = points[i * 2 + 1]!;
    const jx = points[j * 2]!;
    const jy = points[j * 2 + 1]!;
    sum += ix * jy - jx * iy;
  }

  return sum / 2;
};

const reverseWinding = (points: number[]): void => {
  const count = points.length / 2;

  for (let i = 0; i < Math.floor(count / 2); i++) {
    const j = count - 1 - i;
    const ix = points[i * 2]!;
    const iy = points[i * 2 + 1]!;
    const jx = points[j * 2]!;
    const jy = points[j * 2 + 1]!;

    points[i * 2] = jx;
    points[i * 2 + 1] = jy;
    points[j * 2] = ix;
    points[j * 2 + 1] = iy;
  }
};

/** Outward unit normals for a CCW polygon: normal of edge `i→i+1` is `(eY, -eX)`. */
const computeNormals = (points: number[]): number[] => {
  const count = points.length / 2;
  const normals: number[] = [];

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const ix = points[i * 2]!;
    const iy = points[i * 2 + 1]!;
    const jx = points[j * 2]!;
    const jy = points[j * 2 + 1]!;
    const ex = jx - ix;
    const ey = jy - iy;
    const length = Math.hypot(ex, ey);

    normals.push(ey / length, -ex / length);
  }

  return normals;
};

/** Throw unless every interior turn has the same (CCW) orientation. */
const assertConvex = (points: number[]): void => {
  const count = points.length / 2;

  for (let i = 0; i < count; i++) {
    const a = i;
    const b = (i + 1) % count;
    const c = (i + 2) % count;
    const ax = points[a * 2]!;
    const ay = points[a * 2 + 1]!;
    const bx = points[b * 2]!;
    const by = points[b * 2 + 1]!;
    const cx = points[c * 2]!;
    const cy = points[c * 2 + 1]!;
    const e1x = bx - ax;
    const e1y = by - ay;
    const e2x = cx - bx;
    const e2y = cy - by;

    // CCW polygon ⇒ every cross product must be ≥ 0 (strictly > 0 for no collinear run).
    if (e1x * e2y - e1y * e2x <= 0) {
      throw new RangeError('PolygonShape: vertices are not strictly convex (or contain collinear edges).');
    }
  }
};

const boundingRadiusOf = (points: number[]): number => {
  let max = 0;

  for (let i = 0; i < points.length; i += 2) {
    max = Math.max(max, Math.hypot(points[i]!, points[i + 1]!));
  }

  return max;
};
