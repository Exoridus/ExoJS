/**
 * One WebGPU scene, one browser process, one measurement.
 *
 * The counterpart to `test/perf/rendering/run-allocation-cell.ts`, and it exists
 * for the same reason: V8's optimisation state carries across scenes inside a
 * process, so a source-of-truth number — and every callsite attribution — has to
 * come from a process that rendered nothing else. Here "process" means a browser
 * launched for this scene alone, which is why the scene id arrives through a
 * build-time define and the driver (`run-webgpu-allocation.ts`) spawns one
 * vitest run per scene rather than looping in-page.
 *
 * Four modes, selected by `__EXOJS_ALLOC_MODE__`:
 *   alloc       bytes per frame, sampled through CDP (default)
 *   cpu         wall-clock per frame, profiler off
 *   cpu-ab      two spike variants interleaved in one process (see below)
 *   structural  the frame's work units: passes, draws, submits, uploads, binds
 *
 * @internal Test/perf-only.
 */
import { expect, test } from 'vitest';
import { commands } from 'vitest/browser';

import type { SamplingProfileNode } from './heapSamplingCommands';
import type { WebGpuHarness } from './webgpuAllocHarness';
import { createWebGpuHarness, renderOnce } from './webgpuAllocHarness';
import type { WebGpuAllocScene } from './webgpuAllocScenes';
import { findWebGpuArchetype } from './webgpuAllocScenes';

declare const __EXOJS_ALLOC_ID__: string;
declare const __EXOJS_ALLOC_MODE__: string;
declare const __EXOJS_ALLOC_FRAMES__: number;
declare const __EXOJS_ALLOC_WARMUP__: number;
declare const __EXOJS_ALLOC_TOP__: number;
declare const __EXOJS_ALLOC_REPEATS__: number;

interface AllocCommands {
  startHeapSampling: (samplingInterval?: number) => Promise<number>;
  stopHeapSampling: () => Promise<SamplingProfileNode>;
  emitAllocationRecord: (record: unknown) => Promise<number>;
}

const sink = commands as unknown as AllocCommands;

const sumSelfSize = (node: SamplingProfileNode): number => node.selfSize + node.children.reduce((total, child) => total + sumSelfSize(child), 0);

interface CallsiteRow {
  readonly site: string;
  readonly selfBytes: number;
  readonly totalBytes: number;
  readonly stack: string;
}

const frameLabel = (node: SamplingProfileNode): string => {
  const { functionName, url, lineNumber } = node.callFrame;
  // Vite serves every module from a URL with a query string; the file name plus
  // line is what identifies a callsite, and the query only makes rows differ
  // that are the same site.
  const file = url.replace(/\?.*$/u, '').replace(/^.*[/\\]/u, '') || '(native)';

  return `${functionName || '(anonymous)'} @ ${file}:${lineNumber + 1}`;
};

/**
 * Flatten the sampling tree into per-callsite rows keyed by the function AND its
 * two nearest callers — aggregating by function identity alone merges every
 * `(anonymous) @ (native)` in the page into one row and then reports whichever
 * caller was visited first.
 */
const collectCallsites = (head: SamplingProfileNode): CallsiteRow[] => {
  const bySite = new Map<string, { selfBytes: number; totalBytes: number; stack: string }>();

  const walk = (node: SamplingProfileNode, ancestry: readonly string[]): void => {
    const chain = [...ancestry, frameLabel(node)];
    const site = chain.slice(-3).join(' < ');

    if (node.selfSize > 0) {
      const entry = bySite.get(site) ?? { selfBytes: 0, totalBytes: 0, stack: chain.slice(-7).join(' < ') };

      entry.selfBytes += node.selfSize;
      entry.totalBytes += sumSelfSize(node);
      bySite.set(site, entry);
    }

    for (const child of node.children) {
      walk(child, chain);
    }
  };

  walk(head, []);

  return [...bySite.entries()].map(([site, entry]) => ({ site, ...entry })).sort((a, b) => b.selfBytes - a.selfBytes);
};

const kb = (bytes: number): number => Number((bytes / 1024).toFixed(3));

test(`webgpu allocation cell — ${__EXOJS_ALLOC_ID__}`, async () => {
  const archetype = findWebGpuArchetype(__EXOJS_ALLOC_ID__);

  expect(archetype, `unknown archetype '${__EXOJS_ALLOC_ID__}'`).toBeDefined();

  const wantStructural = __EXOJS_ALLOC_MODE__ === 'structural';
  const harness: WebGpuHarness | null = await createWebGpuHarness({ instrument: wantStructural });

  if (harness === null) {
    await sink.emitAllocationRecord({ id: __EXOJS_ALLOC_ID__, skipped: 'no WebGPU adapter in this browser' });

    return;
  }

  // An explicit `--frames` / `--warmup` wins; otherwise the archetype decides,
  // because a 33 ms effect frame and a 0.3 ms sprite frame cannot afford the
  // same window.
  const frames = __EXOJS_ALLOC_FRAMES__ > 0 ? __EXOJS_ALLOC_FRAMES__ : (archetype!.frames ?? 200);
  const warmup = __EXOJS_ALLOC_WARMUP__ > 0 ? __EXOJS_ALLOC_WARMUP__ : (archetype!.warmup ?? 30);

  // ── cpu-ab: two variants of the SAME build, interleaved in one process ──
  // For A/B-ing a spike. Process-to-process variance is the dominant noise term
  // in a browser CPU reading — ±13% measured on `mesh/1000`, which swamps the
  // few percent an allocation fix is worth — and it cancels when both variants
  // run as alternating blocks inside one process.
  //
  // The mode sets `globalThis.__EXOJS_WEBGPU_SPIKE__` to 0 or 1 before each
  // block. NOTHING in shipped code reads it: a spike patch introduces the
  // branch, this mode drives it, and the branch is removed before the fix
  // lands. (It is how the mesh uniform-staging reuse was justified — the JS
  // heap sampler cannot see an `ArrayBuffer` backing store at all, so the only
  // available second indicator was wall clock.)
  if (__EXOJS_ALLOC_MODE__ === 'cpu-ab') {
    const scene: WebGpuAllocScene = archetype!.build(harness);
    const flags = globalThis as unknown as Record<string, unknown>;

    for (let i = 0; i < warmup; i++) renderOnce(harness, scene.root, scene.beforeFrame);

    const blockSize = 50;
    const a: number[] = [];
    const b: number[] = [];

    for (let block = 0; block < Math.max(2, Math.round(frames / blockSize)); block++) {
      const variant = block % 2;

      flags['__EXOJS_WEBGPU_SPIKE__'] = variant;

      // Re-warm a few frames after the switch so the block measures the variant, not the switch.
      for (let f = 0; f < 10; f++) renderOnce(harness, scene.root, scene.beforeFrame);

      const started = performance.now();

      for (let f = 0; f < blockSize; f++) renderOnce(harness, scene.root, scene.beforeFrame);

      (variant === 0 ? a : b).push(((performance.now() - started) * 1000) / blockSize);
    }

    scene.teardown?.();
    harness.destroy();

    const median = (values: number[]): number => {
      const sorted = [...values].sort((x, y) => x - y);

      return Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(1));
    };

    await sink.emitAllocationRecord({ id: __EXOJS_ALLOC_ID__, mode: 'cpu-ab', blockSize, variant0Us: median(a), variant1Us: median(b), a, b });

    return;
  }

  if (__EXOJS_ALLOC_MODE__ === 'cpu') {
    const scene: WebGpuAllocScene = archetype!.build(harness);

    for (let i = 0; i < warmup; i++) renderOnce(harness, scene.root, scene.beforeFrame);

    // `performance.now()` is clamped to ~100 us in a browser, so a per-frame
    // reading quantises a 300 us frame to 0 or 100 and a percentile over those
    // is noise. Blocks of frames are timed instead: each block is far above the
    // clamp, and the spread across blocks is what a p95 would have been for.
    const blockSize = Math.max(1, Math.round(frames / 20));
    const blocks: number[] = [];

    for (let i = 0; i < frames; i += blockSize) {
      const count = Math.min(blockSize, frames - i);
      const started = performance.now();

      for (let f = 0; f < count; f++) renderOnce(harness, scene.root, scene.beforeFrame);

      blocks.push(((performance.now() - started) * 1000) / count);
    }

    scene.teardown?.();
    harness.destroy();
    blocks.sort((a, b) => a - b);

    const at = (quantile: number): number => Number(blocks[Math.min(blocks.length - 1, Math.floor(blocks.length * quantile))]!.toFixed(1));

    await sink.emitAllocationRecord({
      id: __EXOJS_ALLOC_ID__,
      mode: 'cpu',
      frames,
      warmup,
      blockSize,
      medianUs: at(0.5),
      p95Us: at(0.95),
      minUs: at(0),
    });

    return;
  }

  if (wantStructural) {
    const scene: WebGpuAllocScene = archetype!.build(harness);

    for (let i = 0; i < warmup; i++) renderOnce(harness, scene.root, scene.beforeFrame);

    harness.resetCounters();
    renderOnce(harness, scene.root, scene.beforeFrame);

    const { stats } = harness.backend;
    const counters = { ...harness.counters };

    scene.teardown?.();
    harness.destroy();

    await sink.emitAllocationRecord({
      id: __EXOJS_ALLOC_ID__,
      mode: 'structural',
      warmup,
      renderPasses: stats.renderPasses,
      drawCalls: stats.drawCalls,
      batches: stats.batches,
      submittedNodes: stats.submittedNodes,
      culledNodes: stats.culledNodes,
      renderTargetChanges: stats.renderTargetChanges,
      textureUploadBytes: stats.textureUploadBytes,
      bufferUploadBytes: stats.bufferUploadBytes,
      ...counters,
    });

    return;
  }

  // ── alloc: one scene, N sampled windows, each on its own scene instance ──
  const windows: number[] = [];
  let callsites: CallsiteRow[] = [];

  for (let repeat = 0; repeat < Math.max(1, __EXOJS_ALLOC_REPEATS__); repeat++) {
    const scene: WebGpuAllocScene = archetype!.build(harness);

    for (let i = 0; i < warmup; i++) renderOnce(harness, scene.root, scene.beforeFrame);

    await sink.startHeapSampling(512);

    for (let i = 0; i < frames; i++) renderOnce(harness, scene.root, scene.beforeFrame);

    const head = await sink.stopHeapSampling();

    windows.push(sumSelfSize(head) / frames);

    if (repeat === 0 && __EXOJS_ALLOC_TOP__ > 0) {
      callsites = collectCallsites(head).slice(0, __EXOJS_ALLOC_TOP__);
    }

    scene.teardown?.();
  }

  harness.destroy();

  await sink.emitAllocationRecord({
    id: __EXOJS_ALLOC_ID__,
    mode: 'alloc',
    userAgent: navigator.userAgent,
    frames,
    warmup,
    windowsKb: windows.map(kb),
    kbPerFrame: kb(windows.reduce((total, value) => total + value, 0) / windows.length),
    callsites: callsites.map(row => ({
      site: row.site,
      selfKbPerFrame: kb(row.selfBytes / frames),
      totalKbPerFrame: kb(row.totalBytes / frames),
      stack: row.stack,
    })),
  });
});
