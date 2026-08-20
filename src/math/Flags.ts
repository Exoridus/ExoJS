import type { TypedEnum } from '#core/types';

/**
 * Type-safe bitfield utility for managing sets of numeric enum flags.
 *
 * `T` should be a numeric const-enum or a type whose values are `number`.
 * Internally stores the combined flags as a single 32-bit integer.
 *
 * Pass the enum TYPE as `T`, not `typeof MyEnum` - the reverse mapping of a
 * numeric enum object carries string values and does not satisfy the
 * constraint.
 *
 * Rest-argument methods ({@link push}, {@link remove}, {@link has}) allocate an
 * array per call. On hot paths use the mask forms ({@link addMask},
 * {@link removeMask}, {@link hasMask}, {@link popMask}) with a pre-combined
 * mask instead.
 *
 * @example
 * ```ts
 * const flags = new Flags<MyEnum>(MyEnum.A, MyEnum.B);
 * flags.has(MyEnum.A); // true
 * flags.remove(MyEnum.A);
 * flags.push(MyEnum.C);
 *
 * // Hot path: no rest array.
 * flags.addMask(MyEnum.A | MyEnum.C);
 * flags.hasMask(MyEnum.A | MyEnum.B); // true when EITHER is set
 * ```
 */
export class Flags<T extends TypedEnum<T, number>> {
  private _value = 0;

  /** Current combined bitmask of all active flags. */
  public get value(): number {
    return this._value;
  }

  public constructor(...flags: number[]) {
    for (const flag of flags) {
      this._value |= flag;
    }
  }

  /**
   * Set every bit of `mask` (bitwise OR). Mutates in place and returns `this`
   * for chaining.
   *
   * Prefer this over {@link push} on hot paths: a rest parameter allocates an
   * array on every call, and the scene graph's transform invalidation runs one
   * of these per ancestor per mutation.
   */
  public addMask(mask: number): this {
    this._value |= mask;

    return this;
  }

  /**
   * Clear every bit of `mask` (bitwise AND NOT). Mutates in place and returns
   * `this` for chaining. Allocation-free counterpart of {@link remove}.
   */
  public removeMask(mask: number): this {
    this._value &= ~mask;

    return this;
  }

  /**
   * Return `true` when **any** bit of `mask` is currently set. Allocation-free
   * counterpart of {@link has}.
   */
  public hasMask(mask: number): boolean {
    return (this._value & mask) !== 0;
  }

  /**
   * Clear every bit of `mask` and return whether any of them was set before.
   * Allocation-free counterpart of {@link pop}.
   */
  public popMask(mask: number): boolean {
    const active = this.hasMask(mask);

    this.removeMask(mask);

    return active;
  }

  /**
   * Set one or more flags (bitwise OR). Mutates in place and returns `this`
   * for chaining. Allocates a rest array per call - use {@link addMask} on hot
   * paths.
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
    return this.popMask(flag);
  }

  /**
   * Clear one or more flags (bitwise AND NOT). Mutates in place and returns
   * `this` for chaining. Allocates a rest array per call - use
   * {@link removeMask} on hot paths.
   */
  public remove<V extends number = T[keyof T]>(...flags: V[]): this {
    for (const flag of flags) {
      this._value &= ~flag;
    }

    return this;
  }

  /**
   * Return `true` when **any** of the supplied flags are currently set
   * (bitwise OR test). Allocates a rest array and a closure per call - use
   * {@link hasMask} on hot paths.
   */
  public has<V extends number = T[keyof T]>(...flags: V[]): boolean {
    for (const flag of flags) {
      if ((this._value & flag) !== 0) {
        return true;
      }
    }

    return false;
  }

  public clear(): this {
    this._value = 0;

    return this;
  }

  public destroy(): void {
    this.clear();
  }
}
