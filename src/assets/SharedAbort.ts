/**
 * An abortable operation cancelled through a string-keyed release, so a stale
 * release under a different key can never abort an operation it did not
 * start.
 *
 * {@link release} reports whether this particular release was the one that
 * aborted the operation. Once the operation itself has settled, {@link settle}
 * disarms the handle: a later release can no longer abort a fetch whose
 * result already arrived.
 * @internal
 */
export class SharedAbort {
  private readonly _controller = new AbortController();
  private readonly _holders = new Set<string>();
  private _settled = false;

  public constructor(holder: string) {
    this._holders.add(holder);
  }

  /** The signal to hand to `fetch(url, { signal })` (and to any decode step that honors one). */
  public get signal(): AbortSignal {
    return this._controller.signal;
  }

  /**
   * Leave as a holder. Returns `true` only when this departure emptied the
   * holder set and therefore aborted the operation, so the caller can drop its
   * bookkeeping for a handle that is now spent.
   */
  public release(holder: string): boolean {
    if (!this._holders.delete(holder) || this._holders.size > 0 || this._settled) {
      return false;
    }

    this._controller.abort();

    return true;
  }

  /** Abort unconditionally, whatever holders remain (teardown of the owning loader). */
  public abort(): void {
    this._holders.clear();

    if (!this._settled) {
      this._controller.abort();
    }
  }

  /** The shared operation settled: its result is in, so no later release may abort it. */
  public settle(): void {
    this._settled = true;
    this._holders.clear();
  }
}

/**
 * Whether `error` is the rejection a cancelled `fetch` (or any other
 * `AbortSignal`-aware step) produces. Matches on `name` rather than on
 * `instanceof DOMException` so a polyfilled or wrapped abort error is still
 * recognized as a cancellation rather than reported as a load failure.
 * @internal
 */
export const isAbortError = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
