/** A single point of a {@link Manifold}. */
export interface ManifoldPoint {
  /** World-space contact position X. */
  x: number;
  /** World-space contact position Y. */
  y: number;
  /** Penetration depth in px (≥ 0). */
  penetration: number;
  /**
   * Stable feature id identifying which geometric features produced this point.
   * Constant across frames while the contact features are unchanged, and the key
   * the solver's warm-start cache matches accumulated impulses by.
   */
  id: number;
}

/**
 * A contact manifold: the collision normal (oriented from collider A toward
 * collider B) plus 1-2 contact points. A `Manifold` is reused across narrow-phase
 * calls - it preallocates its two points and `reset()`s `pointCount` to 0. The
 * contact solver consumes its points and feature ids, and debug draw renders them.
 */
export class Manifold {
  /** Collision normal X (unit, A → B). */
  public normalX = 0;
  /** Collision normal Y (unit, A → B). */
  public normalY = 0;
  /** Number of valid entries in {@link points} (0, 1 or 2). */
  public pointCount = 0;

  public readonly points: readonly [ManifoldPoint, ManifoldPoint] = [
    { x: 0, y: 0, penetration: 0, id: 0 },
    { x: 0, y: 0, penetration: 0, id: 0 },
  ];

  /** Clear the manifold for reuse. */
  public reset(): void {
    this.pointCount = 0;
    this.normalX = 0;
    this.normalY = 0;
  }
}
