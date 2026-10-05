import { Signal } from '#core/Signal';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface LoadingProgress {
  readonly total: number;
  readonly loaded: number;
  readonly pending: number;
  readonly failed: number;
}

// ---------------------------------------------------------------------------
// LoadingQueue
// ---------------------------------------------------------------------------

/**
 * An awaitable, progress-aware load operation.
 *
 * Implements `PromiseLike<T>` so it can be `await`ed directly and composed
 * with `Promise.all([queue1, queue2])` without wrapping.
 *
 * Progress is updated as individual items complete via {@link _notifyItem}.
 * A load that is no longer wanted can be dropped with {@link cancel}.
 */
export class LoadingQueue<T> implements PromiseLike<T> {
  public readonly onProgress: Signal<[LoadingProgress]>;

  private _progress: LoadingProgress;
  private readonly _promise: Promise<T>;
  private readonly _onCancel: (() => void) | undefined;
  private _cancelled = false;

  /** @internal */
  public constructor(promise: Promise<T>, count: number, onCancel?: () => void) {
    this.onProgress = new Signal<[LoadingProgress]>();
    this._progress = {
      total: count,
      loaded: 0,
      pending: count,
      failed: 0,
    };
    this._promise = promise;
    this._onCancel = onCancel;
  }

  public get progress(): LoadingProgress {
    return this._progress;
  }

  /** Whether {@link cancel} has been called on this queue. */
  public get cancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Gives up on this load: withdraws the stake this load still has in its
   * assets and, once nothing else holds the same asset, aborts the in-flight
   * network request behind it. Idempotent.
   *
   * Only this load's own stake is withdrawn. A claim the same scope already
   * holds - from an earlier load that finished, from `get()`, or from another
   * load of the same asset that is still running - is untouched, and so is any
   * other scope's claim: a second scene loading the same texture keeps it
   * downloading, and only the last holder leaving actually stops the request.
   * The queue then rejects with the platform's `AbortError`; a cancelled load
   * is deliberately NOT reported through `Loader.onError`, since nothing
   * failed.
   *
   * An asset that is already resident and held by nothing but this load is
   * freed. Once the load has settled, its claim belongs to its scope and
   * cancelling no longer affects it; release it through the scope instead.
   */
  public cancel(): void {
    if (this._cancelled) {
      return;
    }

    this._cancelled = true;
    this._onCancel?.();
  }

  /** @internal Called by Loader after each item settles. */
  public _notifyItem(success: boolean): void {
    const prev = this._progress;
    const loaded = prev.loaded + (success ? 1 : 0);
    const failed = prev.failed + (success ? 0 : 1);
    const settled = loaded + failed;

    this._progress = {
      total: prev.total,
      loaded,
      pending: Math.max(0, prev.total - settled),
      failed,
    };

    this.onProgress.dispatch(this._progress);
  }

  // PromiseLike<T>
  public then<Fulfilled = T, Rejected = never>(
    onfulfilled?: ((value: T) => Fulfilled | PromiseLike<Fulfilled>) | null,
    onrejected?: ((reason: unknown) => Rejected | PromiseLike<Rejected>) | null,
  ): Promise<Fulfilled | Rejected> {
    return this._promise.then(onfulfilled, onrejected);
  }

  public catch<Caught = never>(onrejected?: ((reason: unknown) => Caught | PromiseLike<Caught>) | null): Promise<T | Caught> {
    return this._promise.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null): Promise<T> {
    return this._promise.finally(onfinally);
  }
}
