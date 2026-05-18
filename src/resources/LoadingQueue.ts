import { Signal } from '@/core/Signal';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface LoadingProgress {
  readonly total:   number;
  readonly loaded:  number;
  readonly pending: number;
  readonly failed:  number;
  readonly count:   number;
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
      count,
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
      count:   prev.count,
    };

    this.onProgress.dispatch(this._progress);
  }

  // PromiseLike<T>
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  public catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined,
  ): Promise<T | TResult> {
    return this._promise.catch(onrejected);
  }

  public finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this._promise.finally(onfinally);
  }
}
