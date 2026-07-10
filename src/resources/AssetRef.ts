import { LoadState, type LoadStateValue } from '#core/LoadState';

/**
 * Deferred handle for value assets (parsed JSON, text, CSV rows, …), returned
 * by `loader.get(Asset.kind('json', src))` / a bare value path and friends. Values cannot heal in place the way
 * resource handles do, so the REF is the stable identity: {@link value} throws
 * until `'ready'`, {@link loaded} resolves with the value itself, and a failed
 * ref retries (healing in place) on the next `get`.
 */
export class AssetRef<T> {
  /** @internal — load lifecycle, driven by the Loader. */
  public readonly _loadState = new LoadState<T>();
  private _value: T | undefined;
  private _hasValue = false;
  private _parse: ((raw: unknown) => T) | undefined;

  public constructor() {
    this._loadState.begin();
  }

  /** Load lifecycle of this ref: `'loading' | 'ready' | 'failed'`. */
  public get loadState(): LoadStateValue {
    return this._loadState.value;
  }

  /** Load lifecycle: `'loading' | 'ready' | 'failed'` (asset-system v2 §6). */
  public get state(): LoadStateValue {
    return this._loadState.value;
  }

  /** `true` exactly when {@link state} is `'ready'`. */
  public get ready(): boolean {
    return this._loadState.value === 'ready';
  }

  /** The error the last load failed with, or `null` outside `'failed'`. */
  public get error(): Error | null {
    return this._loadState.error;
  }

  /**
   * Promise settling with the parsed value. Re-materialized when a failed
   * load is retried — read it fresh from this getter across load cycles.
   */
  public get loaded(): Promise<T> {
    // The owner argument is only used to materialize an already-'ready'
    // promise, in which case _value is guaranteed to be set.
    return this._loadState.loaded(this._value as T);
  }

  /** The parsed value. Throws while `'loading'` or `'failed'` — await {@link loaded} or check {@link loadState}. */
  public get value(): T {
    if (!this._hasValue || this._loadState.value !== 'ready') {
      throw new Error(`AssetRef.value accessed while '${this._loadState.value}'. Await 'loaded' or check 'loadState'.`);
    }

    return this._value as T;
  }

  /** @internal — set the post-load transform (a config's `parse`) applied to the raw value in {@link _fill}. */
  public _setParse(parse: (raw: unknown) => T): void {
    this._parse = parse;
  }

  /** @internal — fill with the raw loaded value, applying `parse` if one was set. */
  public _fill(raw: unknown): void {
    const value = (this._parse ? this._parse(raw) : raw) as T;
    this._value = value;
    this._hasValue = true;
    this._loadState.settle(value);
  }

  /** @internal */
  public _fail(error: Error): void {
    this._loadState.fail(error);
  }

  /** @internal — re-arm for a retry. */
  public _begin(): void {
    this._value = undefined;
    this._hasValue = false;
    this._loadState.begin();
  }
}
