import type { VectorLike } from '../types';
import type { ShapeType } from './Shape';
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
  public readonly type: ShapeType = 'polygon';

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
      const px = points.length >= 2 ? points[points.length - 2] : NaN;
      const py = points.length >= 2 ? points[points.length - 1] : NaN;

      if (Math.hypot(vertex.x - px, vertex.y - py) < weldEpsilon) {
        continue;
      }

      points.push(vertex.x, vertex.y);
    }

    let count = points.length / 2;

    // Drop a wrap-around duplicate (last ≈ first).
    if (count >= 2 && Math.hypot(points[0] - points[points.length - 2], points[1] - points[points.length - 1]) < weldEpsilon) {
      points.length -= 2;
      count -= 1;
    }

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
      const ix = points[i * 2];
      const iy = points[i * 2 + 1];
      const j = (i + 1) % count;
      const jx = points[j * 2];
      const jy = points[j * 2 + 1];
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

/** Signed area (positive = CCW). */
const signedArea = (points: number[]): number => {
  const count = points.length / 2;
  let sum = 0;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    sum += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
  }

  return sum / 2;
};

const reverseWinding = (points: number[]): void => {
  const count = points.length / 2;

  for (let i = 0; i < Math.floor(count / 2); i++) {
    const j = count - 1 - i;
    const ix = points[i * 2];
    const iy = points[i * 2 + 1];

    points[i * 2] = points[j * 2];
    points[i * 2 + 1] = points[j * 2 + 1];
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
    const ex = points[j * 2] - points[i * 2];
    const ey = points[j * 2 + 1] - points[i * 2 + 1];
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
    const e1x = points[b * 2] - points[a * 2];
    const e1y = points[b * 2 + 1] - points[a * 2 + 1];
    const e2x = points[c * 2] - points[b * 2];
    const e2y = points[c * 2 + 1] - points[b * 2 + 1];

    // CCW polygon ⇒ every cross product must be ≥ 0 (strictly > 0 for no collinear run).
    if (e1x * e2y - e1y * e2x <= 0) {
      throw new RangeError('PolygonShape: vertices are not strictly convex (or contain collinear edges).');
    }
  }
};

const boundingRadiusOf = (points: number[]): number => {
  let max = 0;

  for (let i = 0; i < points.length; i += 2) {
    max = Math.max(max, Math.hypot(points[i], points[i + 1]));
  }

  return max;
};
