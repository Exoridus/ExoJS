/** 32-bit left rotation. */
const rotl = (value: number, shift: number): number => ((value << shift) | (value >>> (32 - shift))) >>> 0;

/** Reciprocal of 2^32, mapping a 32-bit unsigned integer to the half-open `[0, 1)` interval. */
const normalize = 1 / 2 ** 32;

/**
 * Seedable pseudo-random number generator using the xoshiro128** algorithm.
 *
 * xoshiro128** (Blackman & Vigna, 2018) keeps a compact 128-bit state — four
 * 32-bit words — and produces high-quality 32-bit outputs that clear the full
 * BigCrush / PractRand test batteries. It replaces the previous Mersenne
 * Twister: ~16 bytes of state instead of ~2.5 KB, faster, and entirely 32-bit
 * (no 64-bit arithmetic), which suits JavaScript well.
 *
 * The generator is deterministic: calling `setSeed(s)` followed by the same
 * sequence of `next()` calls always produces the same output. Use `reset()`
 * to replay from the current seed without changing it.
 */
export class Random {
  private readonly _state = new Uint32Array(4);
  private _seed = 0;
  private _value = 0;

  public constructor(seed: number = Date.now()) {
    this.setSeed(seed);
  }

  /** The seed value currently in use. */
  public get seed(): number {
    return this._seed;
  }

  /** The last value produced by {@link next}, normalised to its requested range. */
  public get value(): number {
    return this._value;
  }

  /**
   * Set a new seed and reset the generator state. Returns `this` for
   * chaining.
   */
  public setSeed(seed: number): this {
    this._seed = seed;
    this.reset();

    return this;
  }

  /**
   * Reinitialise the generator from the current {@link seed} without
   * changing it — equivalent to rewinding to the start of the sequence.
   * Returns `this` for chaining.
   */
  public reset(): this {
    // Expand the 32-bit seed into the 128-bit state with SplitMix32 so even
    // low-entropy seeds (e.g. 0 or 1) yield a well-distributed initial state.
    let z = this._seed | 0;

    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) | 0;

      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      t ^= t >>> 15;

      this._state[i] = t >>> 0;
    }

    this._value = 0;

    return this;
  }

  /**
   * Advance the generator and return a uniformly-distributed float in the
   * half-open interval `[min, max)`. Defaults to `[0, 1)`.
   */
  public next(min = 0, max = 1): number {
    const state = this._state;
    const result = Math.imul(rotl(Math.imul(state[1], 5), 7), 9) >>> 0;
    const t = state[1] << 9;

    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= t;
    state[3] = rotl(state[3], 11);

    this._value = result * normalize * (max - min) + min;

    return this._value;
  }

  public destroy(): void {
    // no-op — pure value class, kept for Destroyable interface conformance
  }
}
