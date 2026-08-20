/**
 * One abortable operation shared by N named holders.
 *
 * The asset pipeline deduplicates loads: several consumers asking for the same
 * asset attach to a single in-flight fetch. Cancellation therefore cannot be a
 * plain "abort the controller" - the fetch must keep running for as long as ANY
 * holder still needs its result, and only be aborted once the last one leaves.
 *
 * Holders are identified by string (the residency key of whoever joined), so
 * joining twice under the same name is idempotent and a stale release can never
 * drop someone else's interest. {@link release} reports whether that particular
 * departure was the one that aborted the operation.
 *
 * Once the operation itself has settled, {@link settle} disarms the handle: a
 * later release can no longer abort a fetch whose result already arrived.
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

  /** Whether the shared operation has already been aborted. */
  public get aborted(): boolean {
    return this._controller.signal.aborted;
  }

  /** How many holders currently need this operation's result. */
  public get holders(): number {
    return this._holders.size;
  }

  /** Join as a holder - the operation cannot be aborted while this holder stays. Idempotent. */
  public retain(holder: string): void {
    if (this._settled) {
      return;
    }

    this._holders.add(holder);
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
export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}
