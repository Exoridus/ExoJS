import { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface LoadingProgress {
  readonly total:   number;
  readonly loaded:  number;
  readonly pending: number;
  readonly failed:  number;
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
 */
export class LoadingQueue<T> implements PromiseLike<T> {
  public readonly onProgress: Signal<[LoadingProgress]>;

  private _progress: LoadingProgress;
  private readonly _promise: Promise<T>;

  /** @internal */
  public constructor(promise: Promise<T>, count: number) {
    this.onProgress = new Signal<[LoadingProgress]>();
    this._progress = {
      total:   count,
      loaded:  0,
      pending: count,
      failed:  0,
    };
    this._promise = promise;
  }

  public get progress(): LoadingProgress {
    return this._progress;
  }

  /** @internal Called by Loader after each item settles. */
  public _notifyItem(success: boolean): void {
    const prev = this._progress;
    const loaded = prev.loaded + (success ? 1 : 0);
    const failed = prev.failed + (success ? 0 : 1);
    const settled = loaded + failed;

    this._progress = {
      total:   prev.total,
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

  public catch<Caught = never>(
    onrejected?: ((reason: unknown) => Caught | PromiseLike<Caught>) | null,
  ): Promise<T | Caught> {
    return this._promise.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null): Promise<T> {
    return this._promise.finally(onfinally);
  }
}
