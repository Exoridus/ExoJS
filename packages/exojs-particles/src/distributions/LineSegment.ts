import { Vector } from '@codexo/exojs';

import type { Distribution } from './Distribution';

/**
 * Random point on a line segment between `(x0, y0)` and `(x1, y1)`. Uniform
 * parameter distribution: `t = Math.random()` then `lerp(start, end, t)`.
 */
export class LineSegment implements Distribution<Vector> {
  private readonly _scratch = new Vector();

  public constructor(
    public x0: number,
    public y0: number,
    public x1: number,
    public y1: number,
  ) {}

  public sample(out: Vector = this._scratch): Vector {
    const t = Math.random();

    out.set(this.x0 + (this.x1 - this.x0) * t, this.y0 + (this.y1 - this.y0) * t);

    return out;
  }
}
