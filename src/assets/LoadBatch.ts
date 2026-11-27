import type { Signal } from '#core/Signal';

import { reportAssetObserverFailure } from './assetDiagnostics';

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
  private readonly _pending = new Map<string, number>();
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
    this._pending.set(key, (this._pending.get(key) ?? 0) + 1);

    if (this._active === 1) {
      this._signals.onLoadStart.dispatchIsolated(reportAssetObserverFailure, key, url);
    }
  }

  /** Unmatched settlements are ignored. Cancellation settles without reporting an error. */
  public settle(key: string, success: boolean, error?: Error): void {
    const pending = this._pending.get(key);

    if (pending === undefined) {
      return;
    }

    if (pending === 1) {
      this._pending.delete(key);
    } else {
      this._pending.set(key, pending - 1);
    }

    if (success) {
      this._loaded++;
    }

    this._active--;
    const loaded = this._loaded;
    const total = this._total;
    const complete = this._active === 0;

    if (complete) {
      this._total = 0;
    }

    if (!success && error !== undefined) {
      this._signals.onLoadError.dispatchIsolated(reportAssetObserverFailure, key, error);
    }

    this._signals.onLoadProgress.dispatchIsolated(reportAssetObserverFailure, loaded, total, key);

    if (complete) {
      this._signals.onLoadComplete.dispatchIsolated(reportAssetObserverFailure);
    }
  }
}
