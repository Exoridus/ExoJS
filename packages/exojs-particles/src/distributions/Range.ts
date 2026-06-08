import type { Distribution } from './Distribution';

/**
 * Uniform random number in `[min, max]`. Each `sample()` returns a fresh
 * roll; the bounds are inclusive on both ends (modulo the rounding bias
 * inherent to `Math.random()`).
 */
export class Range implements Distribution<number> {
  public constructor(
    public min: number,
    public max: number,
  ) {}

  public sample(): number {
    return this.min + Math.random() * (this.max - this.min);
  }
}
