import type { SceneNode } from '#core/SceneNode';

import type { Collidable, CollisionResponse } from './Collision';
import { CollisionType } from './Collision';
import {
  getCollisionCircleCircle,
  getCollisionCircleRectangle,
  getCollisionEllipseCircle,
  getCollisionPolygonCircle,
  intersectionCircleCircle,
  intersectionCircleEllipse,
  intersectionCirclePoly,
  intersectionLineCircle,
  intersectionPointCircle,
  intersectionRectCircle,
} from './collision-detection';
import type { Ellipse } from './Ellipse';
import { Interval } from './Interval';
import type { Line } from './Line';
import type { Polygon } from './Polygon';
import { Rectangle } from './Rectangle';
import type { ShapeLike } from './ShapeLike';
import { Vector } from './Vector';

let temp: Circle | null = null;

/**
 * Mutable circle shape defined by a centre position and radius. Implements
 * {@link ShapeLike} for use in the collision pipeline.
 *
 * For SAT-based collision the circle is approximated as a regular polygon with
 * {@link Circle.collisionSegments} sides; normals and vertices are cached and
 * regenerated lazily when the shape mutates.
 *
 * `Circle.temp` is a shared scratch instance for intermediate calculations.
 */
export class Circle implements ShapeLike {
  /**
   * Number of polygon segments used to approximate the circle boundary for
   * SAT collision tests. Increasing this improves accuracy at the cost of
   * more normal comparisons. Default: `32`.
   */
  public static collisionSegments = 32;

  public readonly collisionType: CollisionType = CollisionType.Circle;

  private readonly _position: Vector;
  private _collisionVertices: Vector[] | null = null;
  private _verticesDirty = true;
  private _normals: Vector[] | null = null;
  private _normalsDirty = true;
  private _radius: number;

  public constructor(x = 0, y = 0, radius = 0) {
    this._position = new Vector(x, y);
    this._radius = radius;
  }

  public get position(): Vector {
    return this._position;
  }

  public set position(position: Vector) {
    this._position.copy(position);
    this._verticesDirty = true;
    this._normalsDirty = true;
  }

  public get x(): number {
    return this._position.x;
  }

  public set x(x: number) {
    if (this._position.x === x) {
      return;
    }

    this._position.x = x;
    this._verticesDirty = true;
    this._normalsDirty = true;
  }

  public get y(): number {
    return this._position.y;
  }

  public set y(y: number) {
    if (this._position.y === y) {
      return;
    }

    this._position.y = y;
    this._verticesDirty = true;
    this._normalsDirty = true;
  }

  public get radius(): number {
    return this._radius;
  }

  public set radius(radius: number) {
    if (this._radius === radius) {
      return;
    }

    this._radius = radius;
    this._verticesDirty = true;
    this._normalsDirty = true;
  }

  /**
   * Set the circle's centre to `(x, y)`. Invalidates the normal and vertex
   * caches. Returns `this` for chaining.
   */
  public setPosition(x: number, y: number): this {
    this._position.set(x, y);
    this._verticesDirty = true;
    this._normalsDirty = true;

    return this;
  }

  /**
   * Set the circle's radius. No-op when the value has not changed. Invalidates
   * the normal and vertex caches. Returns `this` for chaining.
   */
  public setRadius(radius: number): this {
    if (this._radius !== radius) {
      this._radius = radius;
      this._verticesDirty = true;
      this._normalsDirty = true;
    }

    return this;
  }

  public set(x: number, y: number, radius: number): this {
    this._position.set(x, y);
    this._radius = radius;
    this._verticesDirty = true;
    this._normalsDirty = true;

    return this;
  }

  public copy(circle: Circle): this {
    this._position.copy(circle.position);
    this._radius = circle.radius;
    this._verticesDirty = true;
    this._normalsDirty = true;

    return this;
  }

  public clone(): this {
    return new Circle(this.x, this.y, this.radius) as this;
  }

  public equals({ x, y, radius }: Partial<Circle> = {}): boolean {
    return (x === undefined || this.x === x) && (y === undefined || this.y === y) && (radius === undefined || this.radius === radius);
  }

  public getBounds(): Rectangle {
    return new Rectangle(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
  }

  /**
   * Returns the edge normals for the approximated collision polygon.
   *
   * The returned array is cached and reused across calls — the same array
   * reference is returned on consecutive calls when nothing has changed.
   * This matches the `Sprite.getNormals()` behaviour introduced in 0.6.19.
   *
   * The cache is invalidated automatically when `x`, `y`, `radius`,
   * `position`, `setPosition`, `setRadius`, `set`, or `copy` mutate the
   * circle.
   */
  public getNormals(): Vector[] {
    if (this._normalsDirty) {
      const points = this.getCollisionVertices();

      if (this._normals === null) {
        this._normals = points.map(() => new Vector());
      }

      for (let i = 0; i < points.length; i++) {
        // i and (i + 1) % length are valid indices; _normals was just sized to
        // points.length above.
        const p = points[i]!;
        const next = points[(i + 1) % points.length]!;
        const normal = this._normals[i]!;

        normal
          .set(next.x - p.x, next.y - p.y)
          .rperp()
          .normalize();
      }

      this._normalsDirty = false;
    }

    return this._normals!;
  }

  /**
   * Project this circle onto `axis` and write the scalar interval into
   * `result`. The projection accounts for both the centre and the radius.
   */
  public project(axis: Vector, result: Interval = new Interval()): Interval {
    const center = axis.dot(this.x, this.y);
    const radius = this.radius * axis.length;

    return result.set(center - radius, center + radius);
  }

  public contains(x: number, y: number): boolean {
    return intersectionPointCircle(Vector.temp.set(x, y), this);
  }

  public intersectsWith(target: Collidable): boolean {
    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return intersectionRectCircle((target as SceneNode).getBounds(), this);
      case CollisionType.Rectangle:
        return intersectionRectCircle(target as Rectangle, this);
      case CollisionType.Polygon:
        return intersectionCirclePoly(this, target as Polygon);
      case CollisionType.Circle:
        return intersectionCircleCircle(this, target as Circle);
      case CollisionType.Ellipse:
        return intersectionCircleEllipse(this, target as Ellipse);
      case CollisionType.Line:
        return intersectionLineCircle(target as Line, this);
      case CollisionType.Point:
        return intersectionPointCircle(target as Vector, this);
      default:
        return false;
    }
  }

  public collidesWith(target: Collidable): CollisionResponse | null {
    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return getCollisionCircleRectangle(this, (target as SceneNode).getBounds());
      case CollisionType.Rectangle:
        return getCollisionCircleRectangle(this, target as Rectangle);
      case CollisionType.Polygon:
        return getCollisionPolygonCircle(target as Polygon, this, true);
      case CollisionType.Circle:
        return getCollisionCircleCircle(this, target as Circle);
      case CollisionType.Ellipse:
        return getCollisionEllipseCircle(target as Ellipse, this, true);
      default:
        return null;
    }
  }

  public destroy(): void {
    this._position.destroy();

    if (this._collisionVertices !== null) {
      for (const v of this._collisionVertices) {
        v.destroy();
      }

      this._collisionVertices = null;
    }

    if (this._normals !== null) {
      for (const v of this._normals) {
        v.destroy();
      }

      this._normals = null;
    }
  }

  private getCollisionVertices(): Vector[] {
    if (this._verticesDirty) {
      const segments = Circle.collisionSegments;

      if (this._collisionVertices === null) {
        this._collisionVertices = new Array(segments);

        for (let i = 0; i < segments; i++) {
          this._collisionVertices[i] = new Vector();
        }
      }

      for (let i = 0; i < segments; i++) {
        const angle = (i * 2 * Math.PI) / segments - Math.PI / 2;
        const x = Math.cos(angle) * this._radius;
        const y = Math.sin(angle) * this._radius;

        // i in [0, segments-1]; _collisionVertices was sized to `segments` above.
        this._collisionVertices[i]!.set(this._radius + x, this._radius + y);
      }

      this._verticesDirty = false;
    }

    return this._collisionVertices!;
  }

  /**
   * Shared scratch `Circle` instance for intermediate calculations. Never
   * retain the reference across frames or async boundaries.
   * @internal
   */
  public static get temp(): Circle {
    if (temp === null) {
      temp = new Circle();
    }

    return temp;
  }
}
