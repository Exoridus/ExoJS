import type { Distribution, LifetimeFunction } from './Distribution';

/**
 * Distribution that always returns the same value. Implements both
 * {@link Distribution} and {@link LifetimeFunction} so it can stand in
 * wherever a randomized or time-parameterised value is expected.
 *
 * For mutable types (Vector, Color, ...) the constant value is copied into
 * `out` if provided, otherwise the constructor's value is returned directly.
 * Mutating that returned reference mutates the distribution's source.
 */
export class Constant<T> implements Distribution<T>, LifetimeFunction<T> {
    public constructor(public value: T) {}

    public sample(out?: T): T {
        return this._copyOrReturn(out);
    }

    public evaluate(_t: number, out?: T): T {
        return this._copyOrReturn(out);
    }

    private _copyOrReturn(out?: T): T {
        if (out === undefined || out === null) {
            return this.value;
        }

        const target = out as { copy?: (src: T) => unknown };

        if (typeof target.copy === 'function') {
            target.copy(this.value);

            return out;
        }

        return this.value;
    }
}
