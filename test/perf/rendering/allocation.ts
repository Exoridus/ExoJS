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

// Every field is spelled `?: T | undefined` rather than `?: T`: under the
// repo's `exactOptionalPropertyTypes`, callers that forward an already-optional
// value (`warmup: archetype.warmup`) would otherwise have to spread it in
// conditionally at every call site. The `??` defaults below treat a present
// `undefined` and an absent key identically, so the wider type is honest.
export interface FrameAllocationOptions {
  /** Frames sampled for the rate (default 200). More frames → less statistical noise. */
  readonly frames?: number | undefined;
  /** Warm-up frames before sampling, so one-time cache/buffer/pool growth is excluded (default 30). */
  readonly warmup?: number | undefined;
  /**
   * Sampling interval in bytes (default 512). Finer (smaller) intervals count
   * small allocations more precisely but bloat the inspector profile — at 64 a
   * multi-MB/frame scene over 200 frames overflows V8's 512 MB string cap on the
   * profile transfer. 512 stays accurate over the window while keeping it small.
   */
  readonly samplingInterval?: number | undefined;
  /** Per-frame mutation (move sprites, pan camera) — runs inside the sampled loop. */
  readonly beforeFrame?: (() => void) | undefined;
}

export interface FrameAllocation {
  /** Mean bytes allocated per frame (throwaway rate, includes immediately-dead objects). */
  readonly bytesPerFrame: number;
  /** Total bytes allocated across the sampled window. */
  readonly totalBytes: number;
  /** Frames sampled. */
  readonly frames: number;
}

export interface ColdStartAllocationOptions {
  /** Frames the bootstrap window spans (default 100). */
  readonly frames?: number | undefined;
  readonly samplingInterval?: number | undefined;
  readonly beforeFrame?: (() => void) | undefined;
}

/**
 * A scene's ONE-TIME start-up allocation. Deliberately not a rate: the numbers
 * here are dominated by work that happens once (see
 * {@link measureColdStartAllocation}), so dividing them by a frame count would
 * manufacture a "per frame" figure that describes no frame the scene will ever
 * render again.
 */
export interface ColdStartAllocation {
  /** Bytes the very first frame allocated on its own. */
  readonly firstFrameBytes: number;
  /** Bytes allocated across the whole bootstrap window, first frame included. */
  readonly totalBytes: number;
  /** Frames the bootstrap window spans. */
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

/** Run `body` with the allocation sampler enabled and return the bytes it recorded. */
const sampleBytes = async (samplingInterval: number, body: () => void): Promise<number> => {
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

  body();

  const { profile } = await post<{ profile: import('node:inspector').HeapProfiler.SamplingHeapProfile }>('HeapProfiler.stopSampling');
  await post('HeapProfiler.disable');
  session.disconnect();

  return sumSelfSize(profile.head);
};

/**
 * Sample the per-frame allocation rate of rendering `root` against `harness`.
 * See the module comment for why this uses the allocation sampling profiler
 * rather than a `heapUsed` delta.
 *
 * The `warmup` default (30) is sized for the gate's scenes, which reach steady
 * state within a handful of frames. It is NOT a universal "long enough": a scene
 * whose start-up work scales with node count needs orders more (the 1M reference
 * stage still builds its persistent source and spatial index inside frame 20 —
 * see {@link measureColdStartAllocation}), and a window that straddles that work
 * reports a start-up total divided by the window length, not a rate.
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

  const totalBytes = await sampleBytes(samplingInterval, () => {
    for (let i = 0; i < frames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  return {
    bytesPerFrame: totalBytes / frames,
    totalBytes,
    frames,
  };
};

/**
 * Sample what rendering `root` allocates ONCE, on the way from a freshly built
 * scene to a steady one — the counterpart to {@link measureFrameAllocation},
 * which deliberately warms past exactly this.
 *
 * Measured on the 1M-sprite reference stage, this is the work involved: frame 1
 * builds the render plan over every node, computes and caches a material key per
 * drawable, and snapshots the retained group fragments — ~466 MB at a million
 * sprites, against a steady-state rate of ~15 KB/frame for the same scene. Over
 * the next few dozen frames the root then discovers it is eligible for a
 * persistent source, builds the packed item store and the spatial visibility
 * index, sizes the derived slot tables, and runs its first full selection —
 * visible in a profile as `SourceVisibilityIndex.build` under
 * `RenderRootSource.adopt`, and structurally as the frame's draw-call count
 * collapsing (75 → 1 on that scene) once the persistent path takes over. The
 * first 100 frames together come to ~809 MB.
 *
 * `root` must not have been rendered yet — the first frame is the measurement.
 */
export const measureColdStartAllocation = async (
  harness: WebGl2Harness,
  root: RenderNode,
  options: ColdStartAllocationOptions = {},
): Promise<ColdStartAllocation> => {
  const frames = options.frames ?? 100;
  const samplingInterval = options.samplingInterval ?? 512;
  const { beforeFrame } = options;

  const firstFrameBytes = await sampleBytes(samplingInterval, () => {
    renderOnce(harness, root, beforeFrame);
  });

  const restBytes = await sampleBytes(samplingInterval, () => {
    for (let i = 1; i < frames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  return {
    firstFrameBytes,
    totalBytes: firstFrameBytes + restBytes,
    frames,
  };
};
