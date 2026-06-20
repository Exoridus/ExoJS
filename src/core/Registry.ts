/**
 * Options for a {@link Registry}.
 *
 * @typeParam Key - lookup key, typically a constructor token.
 * @typeParam Value - stored value.
 * @internal
 */
export interface RegistryOptions<Key, Value> {
  /**
   * Resolution walker. Given a key with no direct entry, returns the next key
   * to try (e.g. the prototype-chain parent), or `null` to stop. Omit for
   * exact-match-only lookup.
   */
  walk?: (key: Key) => Key | null;

  /**
   * Per-value disposer, invoked once per **unique** value during
   * {@link Registry.destroy}. Values shared across several keys (e.g. one
   * renderer bound to multiple drawable types) are disposed exactly once.
   */
  dispose?: (value: Value) => void;
}

/**
 * Generic key→value store with inheritance-aware resolution.
 *
 * Backs the engine's constructor-keyed dispatch registries
 * ({@link FactoryRegistry}, {@link RendererRegistry}). Both previously
 * duplicated the same prototype-chain walk and destroy-time de-duplication;
 * this primitive owns that shared mechanism.
 *
 * Conflict policy and error messaging stay with the caller: {@link Registry.set}
 * always overwrites and {@link Registry.resolve} returns `undefined` on a miss,
 * so each owner enforces its own throw/overwrite behaviour with a
 * domain-specific message.
 *
 * @typeParam Key - lookup key, typically a constructor token.
 * @typeParam Value - stored value; must never be `undefined`.
 * @internal
 */
export class Registry<Key, Value> {
  private readonly _entries = new Map<Key, Value>();
  private readonly _walk: ((key: Key) => Key | null) | null;
  private readonly _dispose: ((value: Value) => void) | null;

  public constructor(options: RegistryOptions<Key, Value> = {}) {
    this._walk = options.walk ?? null;
    this._dispose = options.dispose ?? null;
  }

  /** Stores `value` under `key`, overwriting any existing entry. */
  public set(key: Key, value: Value): void {
    this._entries.set(key, value);
  }

  /** Returns `true` if `key` has a direct entry (no walk). */
  public hasOwn(key: Key): boolean {
    return this._entries.has(key);
  }

  /** Returns `true` if `key` or any of its walk-ancestors has an entry. */
  public has(key: Key): boolean {
    return this._find(key) !== undefined;
  }

  /**
   * Returns the value for `key`, walking the key hierarchy on a direct miss.
   * Returns `undefined` if neither `key` nor any ancestor matches.
   */
  public resolve(key: Key): Value | undefined {
    return this._find(key);
  }

  /** Iterates every stored value (including duplicates from shared entries). */
  public values(): IterableIterator<Value> {
    return this._entries.values();
  }

  /**
   * Disposes every unique value (if a disposer was configured) and clears the
   * store.
   */
  public destroy(): void {
    if (this._dispose !== null) {
      const seen = new Set<Value>();

      for (const value of this._entries.values()) {
        if (!seen.has(value)) {
          seen.add(value);
          this._dispose(value);
        }
      }
    }

    this._entries.clear();
  }

  private _find(key: Key): Value | undefined {
    let current: Key | null = key;
    let value: Value | undefined;

    while (current !== null && value === undefined) {
      value = this._entries.get(current);

      if (value === undefined) {
        current = this._walk !== null ? this._walk(current) : null;
      }
    }

    return value;
  }
}
