import { Color } from '@/core/Color';
import type { LifetimeFunction } from './Distribution';

/** A keyframe in a {@link Gradient}: color at lifetime ratio `t` in `[0, 1]`. */
export interface GradientKey {
    t: number;
    color: Color;
}

const compareT = (a: GradientKey, b: GradientKey): number => a.t - b.t;

/**
 * Piecewise-linear color gradient sampled by lifetime ratio `t` in `[0, 1]`.
 * Keyframes are stored sorted by `t`; sampling outside the range returns
 * the nearest endpoint color. Like {@link Curve}, the last accessed segment
 * is cached so monotonically advancing `t` is O(1) amortised.
 *
 * Two output paths:
 * - {@link evaluate} — writes into a `Color` instance (own scratch by default).
 * - {@link evaluateRgba} — returns the packed `0xAABBGGRR` u32 directly,
 *   skipping the Color object. Use this in tight per-particle inner loops
 *   that write into a `Uint32Array` instance buffer.
 *
 * @example
 * const fire = new Gradient([
 *     { t: 0,   color: new Color(1, 1, 1, 1) },     // white
 *     { t: 0.3, color: new Color(1, 0.7, 0.1, 1) }, // orange
 *     { t: 0.7, color: new Color(0.4, 0.1, 0, 0.6) },
 *     { t: 1,   color: new Color(0, 0, 0, 0) },     // transparent black
 * ]);
 */
export class Gradient implements LifetimeFunction<Color> {
    private readonly _keys: ReadonlyArray<GradientKey>;
    private readonly _scratch = new Color();
    private _lastSegment = 0;

    public constructor(keys: ReadonlyArray<GradientKey>) {
        if (keys.length === 0) {
            throw new Error('Gradient requires at least one keyframe.');
        }

        this._keys = [...keys].map((k) => ({ t: k.t, color: k.color.clone() })).sort(compareT);
    }

    public evaluate(t: number, out: Color = this._scratch): Color {
        const keys = this._keys;
        const last = keys.length - 1;

        if (t <= keys[0].t) {
            out.copy(keys[0].color);

            return out;
        }

        if (t >= keys[last].t) {
            out.copy(keys[last].color);

            return out;
        }

        let segment = this._lastSegment;

        if (t < keys[segment].t) {
            segment = 0;
        }

        while (segment < last && t > keys[segment + 1].t) {
            segment++;
        }

        this._lastSegment = segment;

        const a = keys[segment].color;
        const b = keys[segment + 1].color;
        const ka = keys[segment].t;
        const kb = keys[segment + 1].t;
        const ratio = (t - ka) / (kb - ka);

        out.set(
            a.r + (b.r - a.r) * ratio,
            a.g + (b.g - a.g) * ratio,
            a.b + (b.b - a.b) * ratio,
            a.a + (b.a - a.a) * ratio,
        );

        return out;
    }

    /**
     * Returns the gradient sample at `t` packed into a single 32-bit RGBA
     * integer (`0xAABBGGRR`). Avoids the {@link Color} object on the hot
     * path; suitable for direct write into a `Uint32Array` instance buffer.
     */
    public evaluateRgba(t: number): number {
        return this.evaluate(t, this._scratch).toRgba();
    }
}
