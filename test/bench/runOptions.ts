/**
 * Sampling budget of every microbenchmark case: at least ten timed runs after five
 * warm-up runs, over at least 500 ms and 100 ms. Each case is a whole workload in
 * one call, so the far larger tinybench defaults (64 timed and 16 warm-up runs)
 * would multiply the run time of the heaviest cases by five.
 */
export const benchRunOptions = { time: 500, iterations: 10, warmupTime: 100, warmupIterations: 5 } as const;

/** Upper bound for one case, above the sampling budget of the heaviest one. */
export const benchTimeoutMs = 300_000;
