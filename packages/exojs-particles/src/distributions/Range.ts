import type { Distribution } from './Distribution';

/**
 * Uniform random number from `min + Math.random() * (max - min)`. Each
 * `sample()` returns a fresh roll. `Math.random()` is on `[0, 1)`, so the result
 * is below `max` mathematically, but floating-point rounding can land on `max`
 * for some bounds - do not rely on an exclusive upper bound.
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
