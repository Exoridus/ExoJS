import type { SceneNode } from '@/core/SceneNode';
import type { Circle } from '@/math/Circle';
import type { Collidable, CollisionResponse } from '@/math/Collision';
import { CollisionType } from '@/math/Collision';
import {
  intersectionPointCircle,
  intersectionPointEllipse,
  intersectionPointLine,
  intersectionPointPoint,
  intersectionPointPoly,
  intersectionPointRect,
} from '@/math/collision-detection';
import type { Ellipse } from '@/math/Ellipse';
import { Interval } from '@/math/Interval';
import type { Line } from '@/math/Line';
import type { Polygon } from '@/math/Polygon';
import { Rectangle } from '@/math/Rectangle';
import type { ShapeLike } from '@/math/ShapeLike';

import { AbstractVector } from './AbstractVector';

let temp: Vector | null = null;

/**
 * Concrete mutable 2D vector with full {@link AbstractVector} arithmetic and
 * {@link ShapeLike} collision support (treated as a point collider).
 *
 * `Vector.temp` provides a shared scratch instance for intermediate
 * calculations — never store the reference across frames. `Vector.zero` and
 * `Vector.one` are read-only sentinel constants.
 *
 * The four static factory methods (`add`, `subtract`, `multiply`, `divide`)
 * always allocate a new `Vector`. Instance methods mutate in place and return
 * `this` for chaining.
 */
export class Vector extends AbstractVector implements ShapeLike {
  public readonly collisionType: CollisionType = CollisionType.Point;

  public x: number;
  public y: number;

  public constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
  }

  public clone(): this {
    return new Vector(this.x, this.y) as this;
  }

  public copy(vector: Vector): this {
    this.x = vector.x;
    this.y = vector.y;

    return this;
  }

  public intersectsWith(target: Collidable): boolean {
    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return intersectionPointRect(this, (target as SceneNode).getBounds());
      case CollisionType.Rectangle:
        return intersectionPointRect(this, target as Rectangle);
      case CollisionType.Polygon:
        return intersectionPointPoly(this, target as Polygon);
      case CollisionType.Circle:
        return intersectionPointCircle(this, target as Circle);
      case CollisionType.Ellipse:
        return intersectionPointEllipse(this, target as Ellipse);
      case CollisionType.Line:
        return intersectionPointLine(this, target as Line);
      case CollisionType.Point:
        return intersectionPointPoint(this, target as Vector);
      default:
        return false;
    }
  }

  public collidesWith(_target: Collidable): CollisionResponse | null {
    return null;
  }

  public getBounds(): Rectangle {
    return Rectangle.temp.set(this.x, this.y, 0, 0);
  }

  public contains(x: number, y: number): boolean {
    return intersectionPointPoint(Vector.temp.set(x, y), this);
  }

  public getNormals(): Vector[] {
    return [this.clone().rperp().normalize()];
  }

  public project(axis: Vector, interval: Interval = new Interval()): Interval {
    return interval;
  }

  public destroy(): void {
    // no-op — pure value class, kept for Destroyable interface conformance
  }

  public static get temp(): Vector {
    if (temp === null) {
      temp = new Vector();
    }

    return temp;
  }

  public static readonly zero = new Vector(0, 0);
  public static readonly one = new Vector(1, 1);

  /** Return a new `Vector` equal to `v1 + v2`. Does not mutate either operand. */
  public static add(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x + v2.x, v1.y + v2.y);
  }

  /** Return a new `Vector` equal to `v1 - v2`. Does not mutate either operand. */
  public static subtract(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x - v2.x, v1.y - v2.y);
  }

  /** Return a new `Vector` equal to the component-wise product of `v1` and `v2`. Does not mutate either operand. */
  public static multiply(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x * v2.x, v1.y * v2.y);
  }

  /** Return a new `Vector` equal to the component-wise quotient of `v1` / `v2`. Does not mutate either operand. */
  public static divide(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x / v2.x, v1.y / v2.y);
  }
}
