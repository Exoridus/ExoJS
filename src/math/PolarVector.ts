import { Vector } from '@/math/Vector';

/**
 * A 2D vector expressed in polar coordinates: `radius` (magnitude) and `phi`
 * (angle in radians, measured from the positive X-axis).
 */
export class PolarVector {
  public radius: number;
  /** Angle in radians, measured from the positive X-axis. */
  public phi: number;

  public constructor(radius = 0, angle = 0) {
    this.radius = radius;
    this.phi = angle;
  }

  /**
   * Create a `PolarVector` from a Cartesian `vector`, preserving both
   * magnitude and direction. The roundtrip
   * `PolarVector.fromVector(v).toVector()` reproduces `v` (modulo float
   * precision).
   */
  public static fromVector(vector: Vector): PolarVector {
    return new PolarVector(vector.length, vector.angle);
  }

  /**
   * Convert to a Cartesian {@link Vector}. Returns `Vector.temp` — do not
   * store the reference across calls.
   */
  public toVector(): Vector {
    return Vector.temp.set(this.radius * Math.cos(this.phi), this.radius * Math.sin(this.phi));
  }
}
