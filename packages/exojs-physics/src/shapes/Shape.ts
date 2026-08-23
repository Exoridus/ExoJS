/** Discriminant for the concrete shape kinds supported in the MVP. */
export type ShapeType = 'circle' | 'capsule' | 'polygon';

/**
 * Area-based mass properties of a solid shape, from which a {@link Collider}'s
 * density derives the owning body's mass and rotational inertia. Computed once
 * at shape construction and frozen.
 */
export interface ShapeMassProperties {
  /** Surface area in px². `mass = density × area`. */
  readonly area: number;
  /** X of the area centroid in local space. */
  readonly centroidX: number;
  /** Y of the area centroid in local space. */
  readonly centroidY: number;
  /**
   * Second moment of area about the centroid (∫ r² dA). Multiplying by density
   * yields the shape's rotational inertia contribution about its centroid.
   */
  readonly unitInertia: number;
}

/**
 * Immutable local-space collision geometry. A `Shape` carries no transform - a
 * {@link Collider} positions it in a body.
 *
 * Having an interior is a capability, not a given: solid shapes expose
 * {@link massProperties}, while boundary geometry (a segment, a chain of edges)
 * reports `null` and contributes nothing to the owning body's mass. Read the
 * property rather than assuming an area exists.
 */
export abstract class Shape {
  public abstract readonly type: ShapeType;

  /** Radius of the smallest circle about the local origin enclosing the shape. */
  public abstract readonly boundingRadius: number;

  /** Area-based mass properties, or `null` for boundary geometry with no interior. */
  public abstract readonly massProperties: ShapeMassProperties | null;
}
