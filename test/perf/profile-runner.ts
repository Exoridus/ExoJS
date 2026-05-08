/**
 * Profile-mode helpers for running benchmark scenarios with granular
 * timing, allocation tracking, and call-count instrumentation. Used by
 * profile-benchmark.ts. Pure dev-tooling — not exported, not shipped.
 */

import { performance } from 'node:perf_hooks';

export interface SubTiming {
  label: string;
  totalMs: number;
  samples: number;
  avgMs: number;
}

export interface MemoryDelta {
  heapUsedDeltaBytes: number;
  heapUsedDeltaMb: number;
  /** Whether global.gc() was called before the snapshot — true means measurement is more reliable. */
  gcUsed: boolean;
}

export interface CallCount {
  label: string;
  count: number;
}

export interface ProfileScenarioResult {
  name: string;
  totalMs: number;
  iterations: number;
  subTimings: readonly SubTiming[];
  callCounts: readonly CallCount[];
  memory: MemoryDelta;
}

/**
 * A SubTimingTracker collects multiple labeled time deltas during a
 * scenario run, summarizing average ms per label. Use:
 *   const t = new SubTimingTracker();
 *   for (let i = 0; i < N; i++) {
 *       const stop = t.start('phase-A');
 *       doPhaseA();
 *       stop();
 *   }
 *   const summary = t.summarize();
 */
export class SubTimingTracker {
  private readonly _accumulators = new Map<string, { totalMs: number; samples: number }>();

  public start(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const elapsed = performance.now() - startTime;
      const acc = this._accumulators.get(label) ?? { totalMs: 0, samples: 0 };
      acc.totalMs += elapsed;
      acc.samples++;
      this._accumulators.set(label, acc);
    };
  }

  public summarize(): SubTiming[] {
    return Array.from(this._accumulators.entries()).map(([label, { totalMs, samples }]) => ({
      label,
      totalMs,
      samples,
      avgMs: samples > 0 ? totalMs / samples : 0,
    }));
  }
}

/**
 * CallCounter tracks how many times a labeled function was invoked.
 * Use a wrapper:
 *   const counter = new CallCounter();
 *   const wrappedFn = counter.wrap('myFn', myFn);
 *   wrappedFn();  // counts
 */
export class CallCounter {
  private readonly _counts = new Map<string, number>();

  public count(label: string): void {
    this._counts.set(label, (this._counts.get(label) ?? 0) + 1);
  }

  public wrap<F extends (...args: unknown[]) => unknown>(label: string, fn: F): F {
    return ((...args: unknown[]): unknown => {
      this.count(label);
      return fn(...args);
    }) as F;
  }

  public summarize(): CallCount[] {
    return Array.from(this._counts.entries()).map(([label, count]) => ({ label, count }));
  }
}

/**
 * Take a memory snapshot. Run an optional `global.gc()` first if available
 * (requires `--expose-gc` flag) for cleaner deltas. Returns the delta from
 * the previous snapshot.
 */
export class MemoryTracker {
  private _baselineHeapBytes = 0;
  private _gcAvailable: boolean = typeof (globalThis as { gc?: () => void }).gc === 'function';

  public get gcAvailable(): boolean {
    return this._gcAvailable;
  }

  public baseline(): void {
    if (this._gcAvailable) {
      (globalThis as { gc: () => void }).gc();
    }
    this._baselineHeapBytes = process.memoryUsage().heapUsed;
  }

  public delta(): MemoryDelta {
    if (this._gcAvailable) {
      (globalThis as { gc: () => void }).gc();
    }
    const heapUsedDeltaBytes = process.memoryUsage().heapUsed - this._baselineHeapBytes;
    return {
      heapUsedDeltaBytes,
      heapUsedDeltaMb: heapUsedDeltaBytes / (1024 * 1024),
      gcUsed: this._gcAvailable,
    };
  }
}
