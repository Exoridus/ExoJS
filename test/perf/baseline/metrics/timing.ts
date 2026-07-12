/** Sorts a copy of `samples` numerically (never lexicographically) without touching the input. */
const sortedCopy = (samples: readonly number[]): number[] => [...samples].sort((a, b) => a - b);

/**
 * Median of `samples`. Throws on an empty array rather than returning `NaN`, since a silent
 * `NaN` in a benchmark report is worse than a crash.
 */
export const median = (samples: readonly number[]): number => {
  if (samples.length === 0) {
    throw new Error('median: samples must not be empty');
  }

  const sorted = sortedCopy(samples);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * `p`th percentile of `samples` using the nearest-rank method on the sorted array:
 * `index = ceil(p / 100 * n) - 1`, clamped to `[0, n - 1]`. Throws on an empty array rather
 * than returning `NaN`.
 */
export const percentile = (samples: readonly number[], p: number): number => {
  if (samples.length === 0) {
    throw new Error('percentile: samples must not be empty');
  }

  const sorted = sortedCopy(samples);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);

  return sorted[index];
};

/**
 * Whether a cell should abort given its timed samples SO FAR (review B9).
 *
 * Aborting on a SINGLE slow frame lets one GC pause or scheduler blip mistake
 * an otherwise-valid cell for a runaway one — the exact failure that produced
 * a `13.4x` headline number from a cell that ran exactly one frame before
 * aborting (median == p95, no distribution). Instead this looks at the MEDIAN
 * of the last `window` samples: a lone spike among otherwise-fast frames
 * cannot push that median over budget, only a SUSTAINED slowdown can. Returns
 * `false` (never aborts) until at least `window` samples exist, which also
 * guarantees any cell that DOES abort reports a median backed by at least
 * `window` samples, never a single-frame artifact.
 */
export const shouldAbort = (samples: readonly number[], budgetMs: number, window: number): boolean => {
  if (samples.length < window) {
    return false;
  }

  return median(samples.slice(-window)) > budgetMs;
};

/** Records one elapsed-time sample per matched `begin`/`end` call pair. */
export interface FrameTimer {
  /** Marks the start of a frame using the timer's clock. */
  begin(): void;
  /** Marks the end of a frame and appends `end - begin` to {@link samples}. */
  end(): void;
  /** Elapsed-time samples recorded so far, one per completed begin/end pair. */
  readonly samples: readonly number[];
}

/**
 * Creates a {@link FrameTimer} driven by an injectable clock (defaults to `performance.now`),
 * which is what makes it testable without a browser: tests inject a fake clock, the real
 * benchmark runtime supplies `performance.now`.
 */
export const createCpuTimer = (now: () => number = () => performance.now()): FrameTimer => {
  const samples: number[] = [];
  let startedAt: number | undefined;

  return {
    begin(): void {
      startedAt = now();
    },
    end(): void {
      if (startedAt === undefined) {
        throw new Error('createCpuTimer: end() called without a matching begin()');
      }

      samples.push(now() - startedAt);
      startedAt = undefined;
    },
    samples,
  };
};
