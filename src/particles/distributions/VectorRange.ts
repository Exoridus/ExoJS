import { Vector } from '@/math/Vector';

import type { Distribution } from './Distribution';

/**
 * Uniform random vector with each axis sampled independently in its own
 * `[min, max]` range. Each `sample()` writes into the provided `out` Vector
 * (or an internal scratch instance when `out` is omitted).
 *
 * @example
 * const knockback = new VectorRange(-300, 300, -800, -200);  // any X, upward Y
 * knockback.sample(particle.velocity);  // writes into existing instance, no alloc
 */
export class VectorRange implements Distribution<Vector> {
  private readonly _scratch = new Vector();

  public constructor(
    public minX: number,
    public maxX: number,
    public minY: number,
    public maxY: number,
  ) {}

  public sample(out: Vector = this._scratch): Vector {
    out.set(this.minX + Math.random() * (this.maxX - this.minX), this.minY + Math.random() * (this.maxY - this.minY));

    return out;
  }
}
