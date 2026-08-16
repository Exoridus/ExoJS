/**
 * Fresh-process allocation cell runner.
 *
 * Measures ONE archetype in ONE node process, which is what the gate's
 * five-windows-in-one-process median cannot do: V8's optimisation state (and
 * therefore the sampling profiler's attribution) carries across scenes inside a
 * process, so any number that is meant to be a source-of-truth baseline — and
 * every callsite attribution — has to come from a process that rendered nothing
 * else. See the process-level bimodality documented on `scrolling-world/10000`
 * in `allocationScenes.ts` for the failure mode this avoids.
 *
 *   pnpm perf:renderers:alloc:cell -- --id "mesh/1000" [--windows 1] [--frames 200] [--profile] [--top 25]
 *   pnpm perf:renderers:alloc:cell -- --id "mesh/1000" --cpu
 *
 * Prints one JSON object on stdout (last line) so a driver can collect runs;
 * `--profile` writes the callsite table to stderr, so it never mixes into it.
 * `--cpu` swaps the sampler for wall-clock timing — see the block below it.
 *
 * @internal Test/perf-only.
 */
import { Session } from 'node:inspector';

import type { RenderNode } from '#rendering/RenderNode';

import type { AllocationArchetype, AllocationScene } from './allocationScenes';
import { ALLOCATION_ARCHETYPES, ALLOCATION_REPORT_ONLY, buildScrollingWorldReference } from './allocationScenes';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';

type ProfileNode = import('node:inspector').HeapProfiler.SamplingHeapProfileNode;

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const id = flag('id');
const windows = Number(flag('windows') ?? 1);
const frames = Number(flag('frames') ?? 200);
const top = Number(flag('top') ?? 25);
const wantProfile = args.includes('--profile');

if (id === undefined) {
  throw new Error('usage: run-allocation-cell.ts --id "<archetype id>" [--windows N] [--frames N] [--profile] [--top N]');
}

/**
 * `--id "reference/<count>"` builds the scrolling-world reference stage at that
 * node count instead of a catalog archetype — the size where the persistent
 * item source and the derived selection actually run, and the only place some
 * per-scope allocation is visible at all.
 *
 * The warm-up is long on purpose and the number is only meaningful after one
 * earlier sampling window has run in this process: measured cold, this scene
 * reports ~1.9 MB/frame attributed to a function that contains no allocation,
 * which is V8's optimisation state, not the frame (see `runReference` in
 * `run-allocation.ts`). {@link REFERENCE_BOOTSTRAP_FRAMES} is that earlier
 * window, and it doubles as the scene's one-time bootstrap reading.
 */
const referenceCount = /^reference\/(\d+)$/u.exec(id)?.[1];
const REFERENCE_BOOTSTRAP_FRAMES = 100;
const REFERENCE_WARMUP = 600;

const archetype: AllocationArchetype | undefined =
  referenceCount === undefined
    ? [...ALLOCATION_ARCHETYPES, ...ALLOCATION_REPORT_ONLY].find(candidate => candidate.id === id)
    : { id, rationale: 'reference stage', warmup: REFERENCE_WARMUP, build: harness => buildScrollingWorldReference(harness, Number(referenceCount)) };

if (archetype === undefined) {
  throw new Error(`unknown archetype '${id}'`);
}

/** Same lean frame the gate's sampler drives — no `FrameMetrics` object. */
const renderOnce = (harness: WebGl2Harness, root: RenderNode, beforeFrame?: () => void): void => {
  harness.backend.resetStats();
  harness.recorder.reset();
  beforeFrame?.();
  harness.backend.clear();
  root.render(harness.backend);
  harness.backend.flush();
};

const post = <T>(session: Session, method: string, params?: Record<string, unknown>): Promise<T> =>
  new Promise((resolve, reject) => {
    session.post(method, params, (error: Error | null, result?: unknown) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(result as T);
    });
  });

const sample = async (body: () => void): Promise<ProfileNode> => {
  const session = new Session();
  session.connect();

  await post(session, 'HeapProfiler.enable');
  await post(session, 'HeapProfiler.startSampling', {
    samplingInterval: 512,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });

  body();

  const { profile } = await post<{ profile: import('node:inspector').HeapProfiler.SamplingHeapProfile }>(session, 'HeapProfiler.stopSampling');
  await post(session, 'HeapProfiler.disable');
  session.disconnect();

  return profile.head;
};

const sumSelfSize = (node: ProfileNode): number => node.selfSize + node.children.reduce((total, child) => total + sumSelfSize(child), 0);

interface CallsiteRow {
  readonly site: string;
  readonly selfBytes: number;
  readonly totalBytes: number;
  readonly stack: string;
}

const frameLabel = (node: ProfileNode): string => {
  const { functionName, url, lineNumber } = node.callFrame;
  const file = url.replace(/^.*[/\\]/u, '') || '(native)';

  return `${functionName || '(anonymous)'} @ ${file}:${lineNumber + 1}`;
};

/**
 * Flatten the sampling tree into per-callsite rows, keyed by the function AND
 * its two nearest callers. Aggregating by function identity alone merges every
 * `next @ (native)` in the process into one row and then reports whichever
 * caller happened to be visited first — which is exactly the attribution this
 * runner exists to get right.
 */
const collectCallsites = (head: ProfileNode): CallsiteRow[] => {
  const bySite = new Map<string, { selfBytes: number; totalBytes: number; stack: string }>();

  const walk = (node: ProfileNode, ancestry: readonly string[]): void => {
    const chain = [...ancestry, frameLabel(node)];
    const site = chain.slice(-3).join(' < ');

    if (node.selfSize > 0) {
      const entry = bySite.get(site) ?? { selfBytes: 0, totalBytes: 0, stack: chain.slice(-6).join(' < ') };

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

/**
 * Wall-clock companion mode (`--cpu`): the same scene, the same warm-up, but
 * timed with the profiler OFF. An allocation fix that traded bytes for cycles
 * would be invisible to the sampling numbers, and the sampler's own overhead
 * makes a timed run under it useless as a CPU reading.
 */
if (args.includes('--cpu')) {
  const harness = createWebGl2Harness();
  const scene: AllocationScene = archetype.build(harness);
  const warmup = archetype.warmup ?? 30;

  for (let i = 0; i < warmup; i++) {
    renderOnce(harness, scene.root, scene.beforeFrame);
  }

  const timings: number[] = [];

  for (let i = 0; i < frames; i++) {
    const started = performance.now();

    renderOnce(harness, scene.root, scene.beforeFrame);
    timings.push(performance.now() - started);
  }

  scene.teardown?.();
  harness.destroy();
  timings.sort((a, b) => a - b);

  const at = (quantile: number): number => Number((timings[Math.min(timings.length - 1, Math.floor(timings.length * quantile))]! * 1000).toFixed(1));

  console.log(JSON.stringify({ id: archetype.id, frames, medianUs: at(0.5), p95Us: at(0.95) }));
  process.exit(0);
}

const results: number[] = [];
let callsites: CallsiteRow[] = [];
let bootstrapBytes: number | null = null;

for (let window = 0; window < windows; window++) {
  const harness = createWebGl2Harness();
  const scene: AllocationScene = archetype.build(harness);
  const warmup = archetype.warmup ?? 30;

  if (referenceCount !== undefined) {
    const bootstrap = await sample(() => {
      for (let i = 0; i < REFERENCE_BOOTSTRAP_FRAMES; i++) {
        renderOnce(harness, scene.root, scene.beforeFrame);
      }
    });

    bootstrapBytes = sumSelfSize(bootstrap);
  }

  for (let i = 0; i < warmup; i++) {
    renderOnce(harness, scene.root, scene.beforeFrame);
  }

  const head = await sample(() => {
    for (let i = 0; i < frames; i++) {
      renderOnce(harness, scene.root, scene.beforeFrame);
    }
  });

  results.push(sumSelfSize(head) / frames);

  if (wantProfile && window === 0) {
    callsites = collectCallsites(head).slice(0, top);
  }

  scene.teardown?.();
  harness.destroy();
}

const kb = (bytes: number): number => Number((bytes / 1024).toFixed(3));

if (wantProfile) {
  console.error(`\n[profile] ${archetype.id} — top ${callsites.length} callsites by SELF bytes (window 1, ${frames} frames)`);

  for (const row of callsites) {
    console.error(
      `  ${kb(row.selfBytes / frames)
        .toFixed(2)
        .padStart(10)} KB/f self  ${kb(row.totalBytes / frames)
        .toFixed(2)
        .padStart(10)} KB/f total  ${row.site}`,
    );
    console.error(`             ${row.stack}`);
  }
}

console.log(
  JSON.stringify({
    id: archetype.id,
    env: `Node ${process.version} ${process.platform}/${process.arch}`,
    frames,
    warmup: archetype.warmup ?? 30,
    windowsKb: results.map(kb),
    kbPerFrame: kb(results.reduce((total, value) => total + value, 0) / results.length),
    // One-time, NOT a rate: the reference stage's bootstrap window is dominated
    // by work that happens once, so dividing it by its frame count would
    // describe no frame the scene renders again.
    ...(bootstrapBytes === null ? {} : { bootstrapMb: Number((bootstrapBytes / 1024 / 1024).toFixed(1)), bootstrapFrames: REFERENCE_BOOTSTRAP_FRAMES }),
    ...(wantProfile
      ? {
          callsites: callsites.map(row => ({
            site: row.site,
            selfKbPerFrame: kb(row.selfBytes / frames),
            totalKbPerFrame: kb(row.totalBytes / frames),
            stack: row.stack,
          })),
        }
      : {}),
  }),
);
