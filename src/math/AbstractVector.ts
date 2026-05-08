import type { Matrix } from '@/math/Matrix';
import { getDistance } from '@/math/utils';

/**
 * Base class for all 2D vector types in ExoJS. Provides the full arithmetic,
 * geometric, and transformation API shared by {@link Vector},
 * {@link ObservableVector}, and {@link PolarVector}-derived types.
 *
 * All mutating methods return `this` for chaining. Subclasses must implement
 * `x`, `y`, and `destroy()`.
 */
export abstract class AbstractVector {
  public abstract x: number;
  public abstract y: number;

  /**
   * Angle of this vector in radians, measured from the positive Y-axis
   * (clockwise). Setting this rotates the vector to the new angle while
   * preserving its {@link length}. Mutates in place.
   */
  public get direction(): number {
    return Math.atan2(this.x, this.y);
  }

  public set direction(angle: number) {
    const length = this.length;

    this.x = Math.cos(angle) * length;
    this.y = Math.sin(angle) * length;
  }

  /** Alias for {@link direction}. */
  public get angle(): number {
    return this.direction;
  }

  public set angle(angle: number) {
    this.direction = angle;
  }

  /**
   * Euclidean magnitude of this vector. Setting rescales the vector to
   * `magnitude` while preserving its {@link direction}. Mutates in place.
   */
  public get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  public set length(magnitude: number) {
    const direction = this.direction;

    this.x = Math.cos(direction) * magnitude;
    this.y = Math.sin(direction) * magnitude;
  }

  /**
   * Squared Euclidean magnitude. Avoids the `sqrt` — prefer this over
   * {@link length} when only relative comparisons are needed.
   */
  public get lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  public set lengthSq(lengthSquared: number) {
    this.length = Math.sqrt(lengthSquared);
  }

  /** Alias for {@link length}. */
  public get magnitude(): number {
    return this.length;
  }

  public set magnitude(magnitude: number) {
    this.length = magnitude;
  }

  /**
   * Set both components. When `y` is omitted it defaults to `x` (uniform
   * assignment). Mutates in place and returns `this` for chaining.
   */
  public set(x: number, y: number = x): this {
    this.x = x;
    this.y = y;

    return this;
  }

  /**
   * Return `true` when this vector matches all supplied components. Omitting
   * a component skips that comparison, so `v.equals({ x: 0 })` checks only
   * the X component.
   */
  public equals<T extends AbstractVector>({ x, y }: Partial<T> = {}): boolean {
    return (x === undefined || this.x === x) && (y === undefined || this.y === y);
  }

  /**
   * Add `(x, y)` to this vector. When `y` is omitted it defaults to `x`.
   * Mutates in place and returns `this` for chaining.
   */
  public add(x: number, y: number = x): this {
    this.x += x;
    this.y += y;

    return this;
  }

  /**
   * Subtract `(x, y)` from this vector. When `y` is omitted it defaults to
   * `x`. Mutates in place and returns `this` for chaining.
   */
  public subtract(x: number, y: number = x): this {
    this.x -= x;
    this.y -= y;

    return this;
  }

  /**
   * Multiply components by `(x, y)`. When `y` is omitted it defaults to `x`
   * (uniform scale). Mutates in place and returns `this` for chaining.
   */
  public multiply(x: number, y: number = x): this {
    this.x *= x;
    this.y *= y;

    return this;
  }

  /**
   * Divide components by `(x, y)`. Division is skipped silently when either
   * divisor is zero to avoid NaN. Mutates in place and returns `this` for
   * chaining.
   */
  public divide(x: number, y: number = x): this {
    if (x !== 0 && y !== 0) {
      this.x /= x;
      this.y /= y;
    }

    return this;
  }

  /**
   * Scale this vector to unit length. No-op when the vector is zero.
   * Mutates in place and returns `this` for chaining.
   */
  public normalize(): this {
    return this.divide(this.length);
  }

  /**
   * Negate both components. Mutates in place and returns `this` for
   * chaining.
   */
  public invert(): this {
    return this.multiply(-1, -1);
  }

  /**
   * Apply a 3×3 affine `matrix` to this vector (translation + linear
   * transform). Mutates in place and returns `this` for chaining.
   */
  public transform(matrix: Matrix): this {
    return this.set(this.x * matrix.a + this.y * matrix.b + matrix.x, this.x * matrix.c + this.y * matrix.d + matrix.y);
  }

  /**
   * Apply the inverse of `matrix` to this vector. Useful for converting
   * a world-space point into the local space defined by `matrix`. Mutates
   * in place and returns `this` for chaining.
   */
  public transformInverse(matrix: Matrix): this {
    const id = 1 / (matrix.a * matrix.d + matrix.c * -matrix.b);

    return this.set(
      this.x * matrix.d * id + this.y * -matrix.c * id + (matrix.y * matrix.c - matrix.x * matrix.d) * id,
      this.y * matrix.a * id + this.x * -matrix.b * id + (-matrix.y * matrix.a + matrix.x * matrix.b) * id,
    );
  }

  /**
   * Rotate this vector 90° counter-clockwise (left perpendicular):
   * `(-y, x)`. Mutates in place and returns `this` for chaining.
   */
  public perp(): this {
    return this.set(-this.y, this.x);
  }

  /**
   * Rotate this vector 90° clockwise (right perpendicular): `(y, -x)`.
   * Mutates in place and returns `this` for chaining.
   */
  public rperp(): this {
    return this.set(this.y, -this.x);
  }

  /** Return the smaller of the two components. */
  public min(): number {
    return Math.min(this.x, this.y);
  }

  /** Return the larger of the two components. */
  public max(): number {
    return Math.max(this.x, this.y);
  }

  /** Dot product of this vector with `(x, y)`. */
  public dot(x: number, y: number): number {
    return this.x * x + this.y * y;
  }

  /**
   * 2D cross product (scalar z-component of the 3D cross product) of this
   * vector with `vector`. A positive value means `vector` is to the left of
   * this vector.
   */
  public cross<T extends AbstractVector>(vector: T): number {
    return this.x * vector.y - this.y * vector.x;
  }

  /** Euclidean distance from this vector's tip to `vector`'s tip. */
  public distanceTo<T extends AbstractVector>(vector: T): number {
    return getDistance(this.x, this.y, vector.x, vector.y);
  }

  public abstract destroy(): void;
}
