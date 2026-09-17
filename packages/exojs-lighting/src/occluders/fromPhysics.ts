import type { AabbLike, ReadonlyRectangle } from '@codexo/exojs';

import type { OccluderSink, OccluderSource } from './OccluderSource';

/**
 * A collider's world placement, as physics stores it: a translation plus the
 * precomputed sine and cosine of its rotation.
 */
export interface OccluderColliderTransform {
  readonly x: number;
  readonly y: number;
  readonly sin: number;
  readonly cos: number;
}

/**
 * The local-space geometry an occluder reads off a collider shape. Every field
 * but `type` is present only for the kinds that have it.
 */
export interface OccluderColliderShape {
  readonly type: 'circle' | 'capsule' | 'segment' | 'polygon' | 'chain';
  /** Local vertices `[x0, y0, ...]`: a polygon's ring, a chain's path, a segment's or capsule's two ends. */
  readonly vertices?: readonly number[];
  /** Circle and capsule radius. */
  readonly radius?: number;
  /** Whether a chain's path joins back to its start. */
  readonly closed?: boolean;
}

/** What {@link Occluders.fromPhysics} reads off one collider. */
export interface OccluderCollider {
  readonly shape: OccluderColliderShape;
  readonly worldTransform: OccluderColliderTransform;
  readonly isSensor: boolean;
  readonly body: { readonly type: string };
}

/**
 * What {@link Occluders.fromPhysics} needs of a physics world: an AABB query
 * over its live colliders.
 *
 * Structural on purpose. `@codexo/exojs-physics` satisfies it as it stands,
 * and this package does not depend on it, so a project without physics pulls
 * none of it in and a project with a collision layer of its own can still feed
 * shadows from it.
 */
export interface OccluderPhysicsWorld {
  forEachAabbHit(bounds: AabbLike, filter: undefined, callback: (collider: OccluderCollider) => void): void;
}

/** Tuning for {@link Occluders.fromPhysics}. */
export interface PhysicsOccluderOptions {
  /**
   * Restrict to colliders on static bodies. Level geometry is static, and a
   * dynamic body rebuilds the occluder field wherever it moves. Defaults to
   * `true`.
   */
  readonly staticOnly?: boolean;
  /** Include sensor colliders. A sensor is a trigger volume, not a wall. Defaults to `false`. */
  readonly sensors?: boolean;
  /** Edges a circle, or one cap of a capsule, is approximated with. Defaults to `12`. */
  readonly circleSegments?: number;
  /** Final say on whether a collider occludes, after the options above have had theirs. */
  readonly accept?: (collider: OccluderCollider) => boolean;
}

/** @internal - see {@link Occluders.fromPhysics}. */
export const fromPhysics = (world: OccluderPhysicsWorld, options: PhysicsOccluderOptions = {}): OccluderSource => {
  const staticOnly = options.staticOnly ?? true;
  const sensors = options.sensors ?? false;
  const circleSegments = Math.max(3, Math.round(options.circleSegments ?? 12));
  const accept = options.accept;
  const query: AabbLike = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  let scratch = new Float32Array(64);

  const reserve = (floats: number): Float32Array => {
    if (scratch.length < floats) {
      scratch = new Float32Array(floats);
    }

    return scratch;
  };

  return {
    collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
      query.minX = bounds.left;
      query.minY = bounds.top;
      query.maxX = bounds.right;
      query.maxY = bounds.bottom;

      world.forEachAabbHit(query, undefined, collider => {
        if (staticOnly && collider.body.type !== 'static') {
          return;
        }

        if (!sensors && collider.isSensor) {
          return;
        }

        if (accept !== undefined && !accept(collider)) {
          return;
        }

        emit(collider, circleSegments, reserve, out);
      });
    },
  };
};

const emit = (collider: OccluderCollider, circleSegments: number, reserve: (floats: number) => Float32Array, out: OccluderSink): void => {
  const shape = collider.shape;
  const transform = collider.worldTransform;

  switch (shape.type) {
    case 'circle':
      out.addPolyline(circle(transform.x, transform.y, shape.radius ?? 0, circleSegments, reserve), true);

      return;
    case 'capsule':
      out.addPolyline(capsule(collider, circleSegments, reserve), true);

      return;
    case 'polygon':
      out.addPolyline(transformed(shape.vertices, transform, reserve), true);

      return;
    case 'chain':
      out.addPolyline(transformed(shape.vertices, transform, reserve), shape.closed ?? false);

      return;
    case 'segment':
      out.addPolyline(transformed(shape.vertices, transform, reserve), false);
  }
};

const transformed = (
  vertices: readonly number[] | undefined,
  transform: OccluderColliderTransform,
  reserve: (floats: number) => Float32Array,
): Float32Array => {
  if (vertices === undefined) {
    return reserve(0).subarray(0, 0);
  }

  const out = reserve(vertices.length);

  for (let index = 0; index < vertices.length; index += 2) {
    const x = vertices[index]!;
    const y = vertices[index + 1]!;

    out[index] = transform.cos * x - transform.sin * y + transform.x;
    out[index + 1] = transform.sin * x + transform.cos * y + transform.y;
  }

  return out.subarray(0, vertices.length);
};

const circle = (x: number, y: number, radius: number, segments: number, reserve: (floats: number) => Float32Array): Float32Array => {
  const out = reserve(segments * 2);

  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;

    out[index * 2] = x + Math.cos(angle) * radius;
    out[index * 2 + 1] = y + Math.sin(angle) * radius;
  }

  return out.subarray(0, segments * 2);
};

/**
 * A capsule's silhouette: a half-circle at each end, swept so that the two
 * arcs meet at the sides and the ring closes without a seam.
 */
const capsule = (collider: OccluderCollider, circleSegments: number, reserve: (floats: number) => Float32Array): Float32Array => {
  const vertices = collider.shape.vertices;
  const radius = collider.shape.radius ?? 0;
  const transform = collider.worldTransform;

  if (vertices === undefined || vertices.length < 4) {
    return circle(transform.x, transform.y, radius, circleSegments, reserve);
  }

  const capPoints = Math.max(2, circleSegments);
  const out = reserve(capPoints * 4);
  const firstX = transform.cos * vertices[0]! - transform.sin * vertices[1]! + transform.x;
  const firstY = transform.sin * vertices[0]! + transform.cos * vertices[1]! + transform.y;
  const secondX = transform.cos * vertices[2]! - transform.sin * vertices[3]! + transform.x;
  const secondY = transform.sin * vertices[2]! + transform.cos * vertices[3]! + transform.y;
  const axis = Math.atan2(secondY - firstY, secondX - firstX);

  for (let index = 0; index < capPoints; index++) {
    const sweep = (index / (capPoints - 1)) * Math.PI;
    const near = axis - Math.PI / 2 + sweep;
    const far = axis + Math.PI / 2 + sweep;

    out[index * 2] = secondX + Math.cos(near) * radius;
    out[index * 2 + 1] = secondY + Math.sin(near) * radius;
    out[(capPoints + index) * 2] = firstX + Math.cos(far) * radius;
    out[(capPoints + index) * 2 + 1] = firstY + Math.sin(far) * radius;
  }

  return out.subarray(0, capPoints * 4);
};
