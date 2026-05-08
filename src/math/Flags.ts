import type { TypedEnum } from '@/core/types';

/**
 * Type-safe bitfield utility for managing sets of numeric enum flags.
 *
 * `T` should be a numeric const-enum or a type whose values are `number`.
 * Internally stores the combined flags as a single 32-bit integer.
 *
 * @example
 * ```ts
 * const flags = new Flags<typeof MyEnum>(MyEnum.A, MyEnum.B);
 * flags.has(MyEnum.A); // true
 * flags.remove(MyEnum.A);
 * flags.push(MyEnum.C);
 * ```
 */
export class Flags<T extends TypedEnum<T, number>> {
  private _value = 0;

  /** Current combined bitmask of all active flags. */
  public get value(): number {
    return this._value;
  }

  public constructor(...flags: number[]) {
    if (flags.length) {
      this.push(...flags);
    }
  }

  /**
   * Set one or more flags (bitwise OR). Mutates in place and returns `this`
   * for chaining.
   */
  public push<V extends number = T[keyof T]>(...flags: V[]): this {
    for (const flag of flags) {
      this._value |= flag;
    }

    return this;
  }

  /**
   * Remove `flag` and return `true` if it was active before removal, `false`
   * otherwise. Useful for one-shot consumption of a flag.
   */
  public pop<V extends number = T[keyof T]>(flag: V): boolean {
    const active = this.has(flag);

    this.remove(flag);

    return active;
  }

  /**
   * Clear one or more flags (bitwise AND NOT). Mutates in place and returns
   * `this` for chaining.
   */
  public remove<V extends number = T[keyof T]>(...flags: V[]): this {
    for (const flag of flags) {
      this._value &= ~flag;
    }

    return this;
  }

  /**
   * Return `true` when **any** of the supplied flags are currently set
   * (bitwise OR test).
   */
  public has<V extends number = T[keyof T]>(...flags: V[]): boolean {
    return flags.some(flag => (this._value & flag) !== 0);
  }

  public clear(): this {
    this._value = 0;

    return this;
  }

  public destroy(): void {
    this.clear();
  }
}
