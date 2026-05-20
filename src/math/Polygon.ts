import type { SceneNode } from '@/core/SceneNode';
import type { Circle } from '@/math/Circle';
import type { Collidable, CollisionResponse } from '@/math/Collision';
import { CollisionType } from '@/math/Collision';
import { getCollisionPolygonCircle, getCollisionSat } from '@/math/collision-detection';
import {
  intersectionCirclePoly,
  intersectionEllipsePoly,
  intersectionLinePoly,
  intersectionPointPoly,
  intersectionPolyPoly,
  intersectionRectPoly,
} from '@/math/collision-detection';
import type { Ellipse } from '@/math/Ellipse';
import { Interval } from '@/math/Interval';
import type { Line } from '@/math/Line';
import { Rectangle } from '@/math/Rectangle';
import type { ShapeLike } from '@/math/ShapeLike';
import { Vector } from '@/math/Vector';

let temp: Polygon | null = null;

/**
 * Mutable convex polygon defined by a world-space offset `(x, y)` and an
 * array of local-space vertex {@link Vector}s. Implements {@link ShapeLike}
 * with full SAT collision response.
 *
 * Edge vectors are recomputed whenever `setPoints` is called; normals are
 * cached lazily and invalidated on any positional or point mutation.
 *
 * `Polygon.temp` is a shared scratch instance.
 */
export class Polygon implements ShapeLike {
  public readonly collisionType: CollisionType = CollisionType.Polygon;

  private readonly _position: Vector;
  private readonly _points: Vector[] = [];
  private readonly _edges: Vector[] = [];
  /** Cached normals — null until first getNormals() call; reused across calls. */
  private _cachedNormals: Vector[] | null = null;
  private _normalsDirty = true;

  public constructor(points: Vector[] = [], x = 0, y = 0) {
    this._position = new Vector(x, y);
    this.setPoints(points);
  }

  public get position(): Vector {
    return this._position;
  }

  public set position(position: Vector) {
    this._position.copy(position);
    this._normalsDirty = true;
  }

  public get x(): number {
    return this._position.x;
  }

  public set x(x: number) {
    this._position.x = x;
    this._normalsDirty = true;
  }

  public get y(): number {
    return this._position.y;
  }

  public set y(y: number) {
    this._position.y = y;
    this._normalsDirty = true;
  }

  public get points(): Vector[] {
    return this._points;
  }

  public set points(points: Vector[]) {
    this.setPoints(points);
  }

  /**
   * The precomputed edge vectors (each edge is `points[i+1] - points[i]`).
   * Updated automatically by {@link setPoints}. Read-only — mutating the
   * returned array directly will desync the internal state.
   */
  public get edges(): Vector[] {
    return this._edges;
  }

  public setPosition(x: number, y: number): this {
    this._position.set(x, y);
    this._normalsDirty = true;

    return this;
  }

  /**
   * Replace this polygon's vertex array with `newPoints`. Reuses existing
   * `Vector` instances where possible to avoid allocation. Recomputes edge
   * vectors and invalidates the normal cache. Returns `this` for chaining.
   */
  public setPoints(newPoints: Vector[]): this {
    const len = this._points.length;
    const newLen = newPoints.length;
    const diff = len - newLen;
    const sharedLength = Math.min(len, newLen);

    for (let i = 0; i < sharedLength; i++) {
      this._points[i].copy(newPoints[i]);
    }

    if (diff > 0) {
      for (const point of this._points.splice(newLen)) point.destroy();
      for (const point of this._edges.splice(newLen)) point.destroy();
      // Trim the cached normals array if it exists and is longer than newLen.
      if (this._cachedNormals !== null && this._cachedNormals.length > newLen) {
        const removed = this._cachedNormals.splice(newLen);

        for (const v of removed) {
          v.destroy();
        }
      }
    } else if (diff < 0) {
      for (let i = len; i < newLen; i++) {
        this._points.push(newPoints[i].clone());
        this._edges.push(newPoints[i].clone());
      }
    }

    for (let i = 0; i < newLen; i++) {
      const curr = this._points[i];
      const next = this._points[(i + 1) % newLen];

      this._edges[i].set(next.x - curr.x, next.y - curr.y);
    }

    this._normalsDirty = true;

    return this;
  }

  public set(x: number, y: number, points: Vector[]): this {
    this._position.set(x, y);
    this.setPoints(points);
    this._normalsDirty = true;

    return this;
  }

  public copy(polygon: Polygon): this {
    this._position.copy(polygon.position);
    this.setPoints(polygon.points);
    this._normalsDirty = true;

    return this;
  }

  public clone(): this {
    return new Polygon(this.points, this.x, this.y) as this;
  }

  public equals({ x, y, points }: Partial<Polygon> = {}): boolean {
    return (
      (x === undefined || this.x === x) &&
      (y === undefined || this.y === y) &&
      (points === undefined || (this.points.length === points.length && this.points.every((point, index) => point.equals(points[index]))))
    );
  }

  public getBounds(): Rectangle {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of this._points) {
      minX = Math.min(point.x, minX);
      minY = Math.min(point.y, minY);
      maxX = Math.max(point.x, maxX);
      maxY = Math.max(point.y, maxY);
    }

    return new Rectangle(this.x + minX, this.y + minY, maxX - minX, maxY - minY);
  }

  /**
   * Returns the edge normals for this polygon.
   *
   * The returned array is cached and reused across calls — the same array
   * reference is returned on consecutive calls when the polygon has not
   * changed. The cache is invalidated automatically when `setPoints`,
   * `setPosition`, `set`, or `copy` mutate the polygon.
   *
   * This matches the `Circle.getNormals()` and `Sprite.getNormals()`
   * behaviour introduced in 0.6.19.
   */
  public getNormals(): Vector[] {
    if (this._normalsDirty) {
      const n = this._points.length;

      if (this._cachedNormals === null) {
        this._cachedNormals = [];
      }

      // Grow the cache if needed (shrinking is handled in setPoints).
      while (this._cachedNormals.length < n) {
        this._cachedNormals.push(new Vector());
      }

      for (let i = 0; i < n; i++) {
        this._cachedNormals[i].copy(this._edges[i]).rperp().normalize();
      }

      this._normalsDirty = false;
    }

    return this._cachedNormals!;
  }

  public project(axis: Vector, result: Interval = new Interval()): Interval {
    const normal = axis.clone().normalize();
    const projections = this._points.map(point => normal.dot(point.x, point.y));

    return result.set(Math.min(...projections), Math.max(...projections));
  }

  public contains(x: number, y: number): boolean {
    return intersectionPointPoly(Vector.temp.set(x, y), this);
  }

  public intersectsWith(target: Collidable): boolean {
    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return intersectionRectPoly((target as SceneNode).getBounds(), this);
      case CollisionType.Rectangle:
        return intersectionRectPoly(target as Rectangle, this);
      case CollisionType.Polygon:
        return intersectionPolyPoly(this, target as Polygon);
      case CollisionType.Circle:
        return intersectionCirclePoly(target as Circle, this);
      case CollisionType.Ellipse:
        return intersectionEllipsePoly(target as Ellipse, this);
      case CollisionType.Line:
        return intersectionLinePoly(target as Line, this);
      case CollisionType.Point:
        return intersectionPointPoly(target as Vector, this);
      default:
        return false;
    }
  }

  public collidesWith(target: Collidable): CollisionResponse | null {
    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return getCollisionSat(this, target);
      case CollisionType.Rectangle:
        return getCollisionSat(this, target);
      case CollisionType.Polygon:
        return getCollisionSat(this, target);
      case CollisionType.Circle:
        return getCollisionPolygonCircle(this, target as Circle);
      // case CollisionType.Ellipse: return intersectionEllipsePoly(target as Ellipse, this);
      // case CollisionType.Line: return intersectionLinePoly(target as Line, this);
      // case CollisionType.Point: return intersectionPointPoly(target as Vector, this);
      default:
        return null;
    }
  }

  public destroy(): void {
    for (const point of this._points) {
      point.destroy();
    }

    for (const edge of this._edges) {
      edge.destroy();
    }

    if (this._cachedNormals !== null) {
      for (const v of this._cachedNormals) {
        v.destroy();
      }

      this._cachedNormals = null;
    }

    this._position.destroy();
    this._points.length = 0;
    this._edges.length = 0;
  }

  public static get temp(): Polygon {
    if (temp === null) {
      temp = new Polygon();
    }

    return temp;
  }
}
