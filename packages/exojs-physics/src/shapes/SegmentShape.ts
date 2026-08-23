import { Shape } from './Shape';

/** Segments shorter than this (px) have no well-defined orientation. */
const minimumLength = 1e-3;

/**
 * A zero-thickness boundary between two local-space endpoints: level edges,
 * one-off walls, the geometry a body may not cross.
 *
 * It has no interior, so {@link Shape.massProperties} is `null` and the shape
 * contributes collision only - a `dynamic` body needs at least one mass-bearing
 * collider alongside it.
 *
 * A segment blocks from **both** sides. There is no inside for it to be outside
 * of, and a one-sided segment would be a gameplay rule in a geometry costume:
 * express that with the world's `contactModifier`, which decides per contact and
 * per step whether it is solved.
 *
 * Being zero-thickness makes it the worst case for discrete detection - a body
 * that crosses it entirely within one fixed step misses it. Continuous collision
 * covers a fast body against a segment; a fast segment is not swept.
 */
export class SegmentShape extends Shape {
  public readonly type = 'segment' as const;

  /** Local endpoints, flattened - the same layout a polygon uses. */
  public readonly vertices: readonly number[];

  /** The two opposite outward unit normals, flattened. */
  public readonly normals: readonly number[];

  public readonly length: number;
  public readonly boundingRadius: number;

  /** Always `null`: a boundary has no interior and therefore no mass. */
  public readonly massProperties = null;

  public constructor(x0: number, y0: number, x1: number, y1: number) {
    super();

    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      throw new RangeError(`SegmentShape: endpoints must be finite, received (${x0}, ${y0}) and (${x1}, ${y1}).`);
    }

    const ex = x1 - x0;
    const ey = y1 - y0;
    const length = Math.hypot(ex, ey);

    if (length < minimumLength) {
      throw new RangeError(`SegmentShape: the endpoints are coincident (length ${length}).`);
    }

    // Same convention as PolygonShape: the outward normal of the counter-clockwise
    // edge i → i+1 is (eY, -eX). A two-vertex ring has two opposite edges.
    const nx = ey / length;
    const ny = -ex / length;

    this.length = length;
    this.vertices = Object.freeze([x0, y0, x1, y1]);
    this.normals = Object.freeze([nx, ny, -nx, -ny]);
    this.boundingRadius = Math.max(Math.hypot(x0, y0), Math.hypot(x1, y1));

    Object.freeze(this);
  }
}
