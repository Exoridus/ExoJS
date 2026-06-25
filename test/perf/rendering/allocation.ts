/**
 * Allocation sampler for the render-perf harness.
 *
 * Measures the render plan's per-frame **allocation rate** — every byte a frame
 * allocates, including the immediately-dead throwaway objects the plan still
 * produces (per-frame closures, mesh batch records, filter scratch …). The big
 * historical sources — `DrawCommand`/`ScopeEntry`/`MaterialKey` (pooled in 2b)
 * and the per-scope `RenderGroup[]` (eliminated in 2c) — no longer allocate.
 *
 * ── Why not a `heapUsed` delta ──────────────────────────────────────────────
 * The obvious approach — GC to a floor, render N frames, diff `heapUsed` — does
 * NOT work here. The plan's per-frame objects die the instant the frame ends, and
 * V8 reclaims them *concurrently* (minor mark-compact / scavenge) during the
 * sampling window, so they never show up in a heap-size delta. (Measured: a 1000-
 * sprite static frame allocates ~4000 objects yet a `heapUsed` delta reports only
 * ~6 KB/frame — it sees retained growth, not the throwaway rate.) Bumping the
 * young generation does not help; the concurrent collector still runs.
 *
 * Instead this uses V8's **allocation sampling profiler** via `node:inspector`
 * (`HeapProfiler.startSampling` *with* the `includeObjectsCollectedBy*GC` flags —
 * without them it reports only objects still live at stop and misses the dead-on-
 * arrival plan garbage entirely, a ~500× undercount). It records at allocation
 * time, is statistical (one sample per `samplingInterval` bytes) but accurate over
 * a window of many frames, and needs no `--expose-gc`.
 *
 * @internal Test/perf-only.
 */
import { Session } from 'node:inspector';

import type { RenderNode } from '#rendering/RenderNode';

import type { WebGl2Harness } from './harness';

export interface FrameAllocationOptions {
  /** Frames sampled for the rate (default 200). More frames → less statistical noise. */
  readonly frames?: number;
  /** Warm-up frames before sampling, so one-time cache/buffer/pool growth is excluded (default 30). */
  readonly warmup?: number;
  /**
   * Sampling interval in bytes (default 512). Finer (smaller) intervals count
   * small allocations more precisely but bloat the inspector profile — at 64 a
   * multi-MB/frame scene over 200 frames overflows V8's 512 MB string cap on the
   * profile transfer. 512 stays accurate over the window while keeping it small.
   */
  readonly samplingInterval?: number;
  /** Per-frame mutation (move sprites, pan camera) — runs inside the sampled loop. */
  readonly beforeFrame?: () => void;
}

export interface FrameAllocation {
  /** Mean bytes allocated per frame (throwaway rate, includes immediately-dead objects). */
  readonly bytesPerFrame: number;
  /** Total bytes allocated across the sampled window. */
  readonly totalBytes: number;
  /** Frames sampled. */
  readonly frames: number;
}

/** Render one frame leanly — no `FrameMetrics` object, just the plan build + flush. */
const renderOnce = (harness: WebGl2Harness, root: RenderNode, beforeFrame?: () => void): void => {
  harness.backend.resetStats();
  harness.recorder.reset();
  beforeFrame?.();
  harness.backend.clear();
  root.render(harness.backend);
  harness.backend.flush();
};

/** Recursively sum `selfSize` across the sampling-profile tree = total sampled bytes. */
const sumSelfSize = (node: import('node:inspector').HeapProfiler.SamplingHeapProfileNode): number =>
  node.selfSize + node.children.reduce((total, child) => total + sumSelfSize(child), 0);

/**
 * Sample the per-frame allocation rate of rendering `root` against `harness`.
 * See the module comment for why this uses the allocation sampling profiler
 * rather than a `heapUsed` delta.
 */
export const measureFrameAllocation = async (harness: WebGl2Harness, root: RenderNode, options: FrameAllocationOptions = {}): Promise<FrameAllocation> => {
  const frames = options.frames ?? 200;
  const warmup = options.warmup ?? 30;
  const samplingInterval = options.samplingInterval ?? 512;
  const { beforeFrame } = options;

  // Warm-up: let caches/buffers/pools reach steady size so their one-time growth
  // is not counted (it happens before sampling starts).
  for (let i = 0; i < warmup; i++) {
    renderOnce(harness, root, beforeFrame);
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
  // CRITICAL: without these two flags the sampling profiler reports only objects
  // still LIVE at stopSampling — it discards everything the GC reclaimed during
  // the window, i.e. exactly the immediately-dead plan garbage we want to count.
  // (Measured: omitting them undercounts a known 1000-object/frame allocation by
  // ~500×.) Requires Node ≥ 20; older runtimes ignore the extra keys.
  await post('HeapProfiler.startSampling', {
    samplingInterval,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  for (let i = 0; i < frames; i++) {
    renderOnce(harness, root, beforeFrame);
  }

  const { profile } = await post<{ profile: import('node:inspector').HeapProfiler.SamplingHeapProfile }>('HeapProfiler.stopSampling');
  await post('HeapProfiler.disable');
  session.disconnect();

  const totalBytes = sumSelfSize(profile.head);

  return {
    bytesPerFrame: totalBytes / frames,
    totalBytes,
    frames,
  };
};
