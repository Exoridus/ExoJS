import type { Signal } from '#core/Signal';

/** The progress signal surface a {@link LoadBatch} reports into. Implemented by both `Loader` and `LoaderScope`. */
export interface LoadBatchSignals {
  readonly onLoadStart: Signal<[key: string, url: string]>;
  readonly onLoadProgress: Signal<[loaded: number, total: number, key: string]>;
  readonly onLoadComplete: Signal;
  readonly onLoadError: Signal<[key: string, error: Error]>;
}

/**
 * Foreground load-progress accounting for one reporter.
 *
 * A batch opens on the first item started while none is outstanding and closes
 * once every started item has settled, so overlapping loads from one reporter
 * fold into a single reported batch. Each owner keeps its own instance: a
 * scope reports the work of that consumer, the loader reports the aggregate.
 * @internal
 */
export class LoadBatch {
  private readonly _signals: LoadBatchSignals;
  private _active = 0;
  private _loaded = 0;
  private _total = 0;

  public constructor(signals: LoadBatchSignals) {
    this._signals = signals;
  }

  public start(key: string, url: string): void {
    if (this._active === 0) {
      this._loaded = 0;
    }

    this._active++;
    this._total++;

    if (this._active === 1) {
      this._signals.onLoadStart.dispatch(key, url);
    }
  }

  /** `error` is omitted for a cancellation: the batch still settles, but nothing failed. */
  public settle(key: string, success: boolean, error?: Error): void {
    if (success) {
      this._loaded++;
    } else if (error !== undefined) {
      this._signals.onLoadError.dispatch(key, error);
    }

    this._active--;
    this._signals.onLoadProgress.dispatch(this._loaded, this._total, key);

    if (this._active === 0) {
      this._total = 0;
      this._signals.onLoadComplete.dispatch();
    }
  }
}
