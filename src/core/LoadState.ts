/** Load lifecycle of a seamless asset handle. Directly constructed assets are `'ready'`. */
export type LoadStateValue = 'loading' | 'ready' | 'failed';

/**
 * Load-lifecycle tracker composed into seamless asset handles (Texture; later
 * Sound). Owns the handle's {@link LoadStateValue} and the lazily materialized
 * promise backing the handle's `.loaded` getter.
 *
 * The promise is only created when {@link loaded} is accessed, so a handle
 * whose consumers never await it can fail without triggering
 * `unhandledrejection`. {@link begin} drops the cached promise so every load
 * cycle materializes a fresh one — a once-rejected promise would otherwise
 * stay rejected after a successful retry.
 * @internal — driven by the Loader's seamless pipeline via the type adapters.
 */
export class LoadState<Owner> {
  private _value: LoadStateValue = 'ready';
  private _error: Error | null = null;
  private _promise: Promise<Owner> | null = null;
  private _resolve: ((owner: Owner) => void) | null = null;
  private _reject: ((error: Error) => void) | null = null;

  public get value(): LoadStateValue {
    return this._value;
  }

  /** The error the last load cycle failed with, or `null` outside `'failed'`. */
  public get error(): Error | null {
    return this._error;
  }

  /** Lazily materialize the promise backing the owner's `.loaded` getter. */
  public loaded(owner: Owner): Promise<Owner> {
    if (this._promise === null) {
      if (this._value === 'ready') {
        this._promise = Promise.resolve(owner);
      } else if (this._value === 'failed') {
        this._promise = Promise.reject(this._error ?? new Error('Asset failed to load.'));
      } else {
        this._promise = new Promise<Owner>((resolve, reject) => {
          this._resolve = resolve;
          this._reject = reject;
        });
      }
    }

    return this._promise;
  }

  /**
   * Enter `'loading'` and drop the cached promise (re-materialization).
   * Only called from settled states — `'ready'` for a fresh placeholder,
   * `'failed'` for a retry; beginning while a pending promise is materialized
   * would strand its awaiters.
   */
  public begin(): void {
    this._value = 'loading';
    this._error = null;
    this._promise = null;
    this._resolve = null;
    this._reject = null;
  }

  /** Enter `'ready'`; resolves a promise materialized while `'loading'`. */
  public settle(owner: Owner): void {
    this._value = 'ready';
    this._error = null;
    this._resolve?.(owner);
    this._resolve = null;
    this._reject = null;
  }

  /** Enter `'failed'`; rejects a promise materialized while `'loading'`. */
  public fail(error: Error): void {
    this._value = 'failed';
    this._error = error;
    this._reject?.(error);
    this._resolve = null;
    this._reject = null;
  }
}
