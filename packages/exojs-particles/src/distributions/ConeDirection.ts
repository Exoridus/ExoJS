import { Vector } from '@codexo/exojs';

import type { Distribution } from './Distribution';

const tau = Math.PI * 2;

/**
 * Random unit vector inside a cone, scaled by a speed magnitude.
 *
 * The cone is centred on `directionAngle` (in radians, 0 = +X, π/2 = +Y for
 * screen-down coordinates) and spans `±halfAngle` radians around it. Speed
 * is sampled uniformly in `[minSpeed, maxSpeed]`.
 *
 * Use for emission cones, explosions, fountain spread — anywhere the
 * direction has a preferred axis with bounded variance.
 *
 * @example
 * // Upward fountain with ±15° spread, 200-300 px/s:
 * const up = new ConeDirection(-Math.PI / 2, Math.PI / 12, 200, 300);
 * up.sample(particle.velocity);
 */
export class ConeDirection implements Distribution<Vector> {
  private readonly _scratch = new Vector();

  public constructor(
    public directionAngle: number,
    public halfAngle: number,
    public minSpeed: number,
    public maxSpeed: number,
  ) {}

  public sample(out: Vector = this._scratch): Vector {
    const angle = this.directionAngle + (Math.random() * 2 - 1) * this.halfAngle;
    const speed = this.minSpeed + Math.random() * (this.maxSpeed - this.minSpeed);

    out.set(Math.cos(angle) * speed, Math.sin(angle) * speed);

    return out;
  }

  /** Convenience: omnidirectional emission (full circle, 0..2π). */
  public static omni(minSpeed: number, maxSpeed: number): ConeDirection {
    return new ConeDirection(0, tau / 2, minSpeed, maxSpeed);
  }
}
