/** Discriminant for the concrete shape kinds supported in the MVP. */
export type ShapeType = 'circle' | 'polygon';

/**
 * Immutable local-space collision geometry. A `Shape` carries no transform — a
 * {@link Collider} positions it in a body. Shapes also expose the area-based
 * mass properties (`area`, `centroid`, `unitInertia`) the body uses to derive
 * mass and rotational inertia from a density; these are computed once at
 * construction and frozen.
 *
 * `unitInertia` is the second moment of area about the shape's own centroid
 * (∫ r² dA). Multiplying by density yields the rotational inertia contribution
 * of the shape about its centroid.
 */
export abstract class Shape {
  public abstract readonly type: ShapeType;

  /** Radius of the smallest circle about the local origin enclosing the shape. */
  public abstract readonly boundingRadius: number;

  /** Surface area in px². `mass = density × area`. */
  public abstract readonly area: number;

  /** X of the area centroid in local space. */
  public abstract readonly centroidX: number;

  /** Y of the area centroid in local space. */
  public abstract readonly centroidY: number;

  /** Second moment of area (∫ r² dA) about the centroid; `inertia = density × unitInertia`. */
  public abstract readonly unitInertia: number;
}
