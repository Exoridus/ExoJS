import type { LifetimeFunction } from './Distribution';

/** A keyframe in a {@link Curve}: value `v` at lifetime ratio `t` in `[0, 1]`. */
export interface CurveKey {
  t: number;
  v: number;
}

const compareT = (a: CurveKey, b: CurveKey): number => a.t - b.t;

/**
 * Piecewise-linear keyframe curve sampled by lifetime ratio `t` in `[0, 1]`.
 *
 * Keyframes are stored sorted by `t` and clamped at the endpoints — sampling
 * outside the keyframe range returns the nearest endpoint value. The
 * implementation tracks the last accessed segment so monotonically advancing
 * `t` (the typical case for per-particle lifetime sampling) costs O(1)
 * amortized per call instead of O(log n).
 *
 * @example
 * // Scale pulses up then down over lifetime:
 * const sizeCurve = new Curve([
 *     { t: 0,    v: 0.2 },
 *     { t: 0.4,  v: 1.5 },
 *     { t: 1,    v: 0.0 },
 * ]);
 * scale.x = scale.y = sizeCurve.evaluate(particle.elapsedRatio);
 */
export class Curve implements LifetimeFunction<number> {
  private readonly _keys: CurveKey[];
  private _lastSegment = 0;

  public constructor(keys: readonly CurveKey[]) {
    if (keys.length === 0) {
      throw new Error('Curve requires at least one keyframe.');
    }

    this._keys = [...keys].sort(compareT);
  }

  public evaluate(t: number): number {
    const keys = this._keys;
    const last = keys.length - 1;
    const first = keys[0];
    const lastKey = keys[last];

    if (first === undefined || lastKey === undefined) return 0;

    if (t <= first.t) return first.v;
    if (t >= lastKey.t) return lastKey.v;

    // Cache-friendly forward search: most callers sweep t monotonically.
    let segment = this._lastSegment;

    if (t < (keys[segment]?.t ?? 0)) {
      segment = 0;
    }

    while (segment < last && t > (keys[segment + 1]?.t ?? Infinity)) {
      segment++;
    }

    this._lastSegment = segment;

    const a = keys[segment];
    const b = keys[segment + 1];

    if (a === undefined || b === undefined) return lastKey.v;

    const ratio = (t - a.t) / (b.t - a.t);

    return a.v + (b.v - a.v) * ratio;
  }
}
