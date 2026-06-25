/**
 * Allocation-rate sampler for the physics perf gate.
 *
 * Mirrors the render-perf harness's method (root `test/perf/rendering/
 * allocation.ts`): a `heapUsed` delta does NOT measure short-lived per-step
 * garbage — V8 reclaims it concurrently during the window, so it never shows up
 * in a heap-size diff (a `heapUsed` delta reports retained growth plus noise,
 * not the throwaway rate). Instead this uses V8's allocation **sampling
 * profiler** via `node:inspector`, started with the `includeObjectsCollectedBy*
 * GC` flags — without them the profile reports only objects still live at stop
 * and misses the dead-on-arrival garbage entirely (a ~500× undercount). It
 * records at allocation time, is statistical (one sample per `samplingInterval`
 * bytes) but accurate over a window of many iterations, and needs no
 * `--expose-gc`.
 *
 * Kept as a small package-local copy (rather than importing the root render
 * helper) so the physics package test suite stays self-contained.
 *
 * @internal Test/perf-only.
 */
import { Session } from 'node:inspector';

export interface AllocationRate {
  /** Mean bytes allocated per iteration (includes immediately-dead garbage). */
  readonly bytesPerIteration: number;
  /** Total bytes sampled across the window. */
  readonly totalBytes: number;
  /** Iterations sampled. */
  readonly iterations: number;
}

/** Recursively sum `selfSize` across the sampling-profile tree = total sampled bytes. */
const sumSelfSize = (node: import('node:inspector').HeapProfiler.SamplingHeapProfileNode): number =>
  node.selfSize + node.children.reduce((total, child) => total + sumSelfSize(child), 0);

export interface AllocationSampleOptions {
  /** Iterations sampled for the rate (default 200). More → less statistical noise. */
  readonly iterations?: number;
  /** Warm-up iterations before sampling, excluding one-time growth (default 0; callers usually pre-settle). */
  readonly warmup?: number;
  /** Sampling interval in bytes (default 256). Smaller = finer but larger profiles. */
  readonly samplingInterval?: number;
}

/**
 * Sample the per-iteration allocation rate of `run` (e.g. one `world.step`).
 * See the module comment for why this uses the sampling profiler rather than a
 * `heapUsed` delta.
 */
export const measureAllocationRate = async (run: () => void, options: AllocationSampleOptions = {}): Promise<AllocationRate> => {
  const iterations = options.iterations ?? 200;
  const warmup = options.warmup ?? 0;
  const samplingInterval = options.samplingInterval ?? 256;

  for (let i = 0; i < warmup; i++) {
    run();
  }

  const session = new Session();
  session.connect();

  const post = <T>(method: string, params?: Record<string, unknown>): Promise<T> =>
    new Promise((resolve, reject) => {
      session.post(method, params, (error: Error | null, result?: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result as T);
      });
    });

  await post('HeapProfiler.enable');
  // CRITICAL: without these flags the profiler reports only objects still LIVE
  // at stopSampling and discards the throwaway per-step garbage this gate exists
  // to catch (a ~500× undercount). Node ≥ 20; older runtimes ignore the keys.
  await post('HeapProfiler.startSampling', {
    samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  for (let i = 0; i < iterations; i++) {
    run();
  }

  const { profile } = await post<{ profile: import('node:inspector').HeapProfiler.SamplingHeapProfile }>('HeapProfiler.stopSampling');
  await post('HeapProfiler.disable');
  session.disconnect();

  const totalBytes = sumSelfSize(profile.head);

  return { bytesPerIteration: totalBytes / iterations, totalBytes, iterations };
};
