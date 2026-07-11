/**
 * Algorithmic call-counters for the CPU collect/play pipeline (F1 CPU-shape gate).
 *
 * Wraps the hot collect-path methods on their prototypes and tallies how many
 * times each is invoked while rendering a single frame. Unlike the allocation
 * sampler (statistical) or wall-clock timing (machine-dependent), these are
 * exact integers that depend only on the CPU-side algorithm — identical on
 * every machine and every run — so they can be pinned with `toBe(n)` and act as
 * a hard regression gate on the *shape* of the collect walk.
 *
 * The wrapped methods mirror the four sub-phases the collect-phase benchmark
 * (`test/perf/collect-phase-benchmark.ts`) attributes build() time to:
 *   - `RenderNode._collect`            — node visits entering the cull/emit gate
 *   - `SceneNode.inView`               — view-frustum cull checks
 *   - `SceneNode.getGlobalTransform`   — world-transform resolutions (build + play)
 *   - `Drawable._getOrComputeMaterialKey` — per-draw material-key resolutions
 *
 * A rising count means the collect path is doing more per-node work than the
 * pinned baseline — e.g. a retained-skip fast path stopped engaging and the walk
 * regressed from O(1) splice back to O(n) re-collect.
 *
 * @internal Test/perf-only.
 */
import { SceneNode } from '#core/SceneNode';
import { Drawable } from '#rendering/Drawable';
import { RenderNode } from '#rendering/RenderNode';

import type { WebGl2Harness } from './harness';

/** Exact per-frame algorithmic counts for the collect/play pipeline. */
export interface CollectCounters {
  /** `RenderNode._collect` calls — nodes visited by the collect walk. */
  collect: number;
  /** `SceneNode.inView` calls — view-frustum cull checks performed. */
  inView: number;
  /** `SceneNode.getGlobalTransform` calls — world-transform resolutions (build + play). */
  globalTransform: number;
  /** `Drawable._getOrComputeMaterialKey` calls — per-draw material-key resolutions. */
  materialKey: number;
}

/** Counters plus the deterministic per-frame `RenderStats` totals. */
export interface FrameCounters extends CollectCounters {
  /** Drawables submitted (post-cull draw commands) — `RenderStats.submittedNodes`. */
  submittedNodes: number;
  /** Nodes skipped by culling — `RenderStats.culledNodes`. */
  culledNodes: number;
  /** GPU draw calls issued — `RenderStats.drawCalls`. */
  drawCalls: number;
  /** Draw batches flushed — `RenderStats.batches`. */
  batches: number;
}

interface Installed {
  readonly counters: CollectCounters;
  uninstall(): void;
}

const installCounters = (): Installed => {
  const counters: CollectCounters = { collect: 0, inView: 0, globalTransform: 0, materialKey: 0 };
  const uninstallers: Array<() => void> = [];

  const wrap = <T extends object>(proto: T, method: keyof T & string, key: keyof CollectCounters): void => {
    const original = proto[method] as unknown as (...args: unknown[]) => unknown;

    (proto[method] as unknown) = function (this: unknown, ...args: unknown[]): unknown {
      counters[key]++;

      return original.apply(this, args);
    };

    uninstallers.push(() => {
      (proto[method] as unknown) = original;
    });
  };

  // `_collect` is defined on RenderNode; RetainedContainer/Video override it but
  // call `super._collect`, which resolves to this wrapped implementation — so a
  // single wrap here counts every node visit regardless of subclass.
  wrap(RenderNode.prototype, '_collect', 'collect');
  wrap(SceneNode.prototype, 'inView', 'inView');
  wrap(SceneNode.prototype, 'getGlobalTransform', 'globalTransform');
  wrap(Drawable.prototype, '_getOrComputeMaterialKey', 'materialKey');

  return {
    counters,
    uninstall(): void {
      // Reverse order keeps nested wraps (none today) unwinding cleanly.
      for (let i = uninstallers.length - 1; i >= 0; i--) {
        uninstallers[i]!();
      }
    },
  };
};

export interface CounterFrameOptions {
  /** Frames rendered before the measured frame so retained caches reach steady state (default 4). */
  readonly warmup?: number;
  /** Per-frame mutation (move sprites, pan camera). Runs on every warmup frame AND the measured frame. */
  readonly beforeFrame?: () => void;
}

const renderOnce = (harness: WebGl2Harness, root: RenderNode, beforeFrame?: () => void): void => {
  harness.backend.resetStats();
  harness.recorder.reset();
  beforeFrame?.();
  harness.backend.clear();
  root.render(harness.backend);
  harness.backend.flush();
};

/**
 * Warm `root` to steady state, then render exactly one instrumented frame and
 * return its algorithmic counters plus the frame's `RenderStats` totals. Every
 * value is a deterministic integer suitable for a `toBe(n)` gate.
 */
export const measureFrameCounters = (harness: WebGl2Harness, root: RenderNode, options: CounterFrameOptions = {}): FrameCounters => {
  const warmup = options.warmup ?? 4;
  const { beforeFrame } = options;

  for (let i = 0; i < warmup; i++) {
    renderOnce(harness, root, beforeFrame);
  }

  const { counters, uninstall } = installCounters();

  try {
    renderOnce(harness, root, beforeFrame);
  } finally {
    uninstall();
  }

  const stats = harness.backend.stats;

  return {
    ...counters,
    submittedNodes: stats.submittedNodes,
    culledNodes: stats.culledNodes,
    drawCalls: stats.drawCalls,
    batches: stats.batches,
  };
};
