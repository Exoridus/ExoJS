/**
 * Fresh-process COLD/BOOTSTRAP allocation cell runner.
 *
 * The steady-state runners (`run-allocation.ts`, `run-allocation-cell.ts`) warm
 * past scene establishment on purpose and report a per-frame rate. This runner
 * measures exactly what they discard: everything a scene allocates on the way
 * from "nothing exists" to "the frame rate is flat".
 *
 *   pnpm perf:renderers:bootstrap:cell -- --count 1000000 [--frames 100] [--profile] [--top 25]
 *   pnpm perf:renderers:bootstrap:cell -- --count 1000000 --cpu
 *   pnpm perf:renderers:bootstrap:cell -- --count 100000 --incremental 100
 *
 * ── Why one cardinality per process ─────────────────────────────────────────
 * V8's optimisation state carries across scenes inside a process and moves the
 * sampling profiler's attribution with it (documented on `scrolling-world/10000`
 * in `allocationScenes.ts`: the same frame reads 1.9 MB or 15 KB depending only
 * on whether an earlier window ran). A bootstrap reading is a FIRST-EVER-touch
 * measurement by definition, so it is worth nothing if anything else ran first.
 * The driver (`run-bootstrap-allocation.ts`) spawns one process per cell.
 *
 * ── The four quantities, never inferred from one another ────────────────────
 *   allocBytes     cumulative allocation traffic through the phase (sampler)
 *   heapAfterBytes live heap after two forced GCs at the phase end
 *   retainedBytes  heapAfter delta vs. the previous phase = what the phase kept
 *   peakHeapBytes  `heapTotal` high-water mark observed at the phase end
 *
 * `allocBytes` is traffic, not residency: a phase can allocate 400 MB and retain
 * 40. Only `retainedBytes` is memory the scene still costs afterwards.
 *
 * Requires `--expose-gc` (the script wires it); without it the heap columns are
 * reported as null rather than silently reporting un-collected garbage as live.
 *
 * @internal Test/perf-only.
 */
import { Session } from 'node:inspector';

import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';

import { makeTextures, scatterInView } from './fixtures';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';

type ProfileNode = import('node:inspector').HeapProfiler.SamplingHeapProfileNode;

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const count = Number(flag('count') ?? 1000);
const rampFrames = Number(flag('frames') ?? 100);
const steadyFrames = Number(flag('steady') ?? 100);
const steadyWarmup = Number(flag('warmup') ?? 600);
const samplingInterval = Number(flag('interval') ?? 512);
const top = Number(flag('top') ?? 25);
const wantProfile = args.includes('--profile');
const wantCpu = args.includes('--cpu');
/** Chunks the scene is built in when streaming instead of bulk-constructing. */
const incrementalChunks = Number(flag('incremental') ?? 0);

const VIEW = { w: 1280, h: 720 } as const;
const WORLD = { w: VIEW.w * 2, h: VIEW.h * 2 } as const;

const gc = globalThis.gc as (() => void) | undefined;

/** Live heap after settling the collector, or null when `--expose-gc` is missing. */
const liveHeap = (): number | null => {
  if (gc === undefined) {
    return null;
  }

  gc();
  gc();

  return process.memoryUsage().heapUsed;
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
  // Without the two GC flags the profiler reports only what is still live at
  // stop, which for a bootstrap window discards most of the traffic it exists
  // to measure. See the block comment in `allocation.ts`.
  await post(session, 'HeapProfiler.startSampling', {
    samplingInterval,
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

const frameLabel = (node: ProfileNode): string => {
  const { functionName, url, lineNumber } = node.callFrame;
  const file = url.replace(/^.*[/\\]/u, '') || '(native)';

  return `${functionName || '(anonymous)'} @ ${file}:${lineNumber + 1}`;
};

interface CallsiteRow {
  readonly site: string;
  readonly selfBytes: number;
}

/** Flatten the sampling tree into per-callsite rows keyed by the two nearest callers. */
const collectCallsites = (head: ProfileNode): CallsiteRow[] => {
  const bySite = new Map<string, number>();

  const walk = (node: ProfileNode, ancestry: readonly string[]): void => {
    const chain = [...ancestry, frameLabel(node)];

    if (node.selfSize > 0) {
      const site = chain.slice(-3).join(' < ');
      bySite.set(site, (bySite.get(site) ?? 0) + node.selfSize);
    }

    for (const child of node.children) {
      walk(child, chain);
    }
  };

  walk(head, []);

  return [...bySite.entries()].map(([site, selfBytes]) => ({ site, selfBytes })).sort((a, b) => b.selfBytes - a.selfBytes);
};

/** Same lean frame the allocation gate drives — no `FrameMetrics` object. */
const renderOnce = (harness: WebGl2Harness, root: RenderNode, beforeFrame?: () => void): void => {
  harness.backend.resetStats();
  harness.recorder.reset();
  beforeFrame?.();
  harness.backend.clear();
  root.render(harness.backend);
  harness.backend.flush();
};

/**
 * Ping-pong the camera exactly as `buildScrollingWorldReference` does, so a
 * bootstrap reading here and a steady reading from the reference stage describe
 * the same scene. Ping-pong rather than wrap: a modulo wrap teleports the camera
 * once per cycle and invalidates every view-dependent cached product at once.
 */
const pingPongCamera = (harness: WebGl2Harness, speed: number): (() => void) => {
  const spanX = Math.max(1, WORLD.w - VIEW.w);
  const spanY = Math.max(1, WORLD.h - VIEW.h);
  const period = spanX * 2;
  let frame = 0;

  return (): void => {
    frame++;

    const t = (frame * speed) % period;
    const offset = t <= spanX ? t : period - t;

    harness.view.setCenter(VIEW.w / 2 + offset, VIEW.h / 2 + (offset / spanX) * spanY);
  };
};

/**
 * Construct `n` sprites into `root`, from `first`. Split out of the fixture
 * builder on purpose: `buildSpriteScene` also accumulates a `Sprite[]` for the
 * caller, and at a million nodes that array's geometric growth is a measurement
 * artefact of the fixture rather than a cost the engine imposes. The array is
 * measured here as its own phase instead of being folded into construction.
 */
const buildInto = (root: Container, texture: Texture, first: number, n: number): void => {
  for (let i = first; i < first + n; i++) {
    const sprite = new Sprite(texture);

    scatterInView(sprite, i, WORLD.w, WORLD.h);
    root.addChild(sprite);
  }
};

interface PhaseResult {
  readonly phase: string;
  readonly allocBytes: number;
  readonly ms: number;
  readonly heapAfterBytes: number | null;
  readonly retainedBytes: number | null;
  readonly peakHeapBytes: number;
  readonly rssBytes: number;
  readonly callsites?: readonly CallsiteRow[];
}

const phases: PhaseResult[] = [];
let previousHeap = liveHeap();

/**
 * Run one phase under the sampler and record all four quantities.
 *
 * The wall-clock in `ms` is taken WITH the profiler running and is therefore an
 * upper bound, not a CPU reading — `--cpu` re-runs the same phase sequence with
 * the profiler off for that.
 */
const phase = async (name: string, body: () => void): Promise<void> => {
  const started = performance.now();
  const head = await sample(body);
  const ms = performance.now() - started;
  const memory = process.memoryUsage();
  const heapAfterBytes = liveHeap();

  phases.push({
    phase: name,
    allocBytes: sumSelfSize(head),
    ms: Number(ms.toFixed(1)),
    heapAfterBytes,
    retainedBytes: heapAfterBytes === null || previousHeap === null ? null : heapAfterBytes - previousHeap,
    peakHeapBytes: memory.heapTotal,
    rssBytes: memory.rss,
    ...(wantProfile ? { callsites: collectCallsites(head).slice(0, top) } : {}),
  });

  previousHeap = heapAfterBytes;
};

/**
 * Wall-clock companion mode (`--cpu`): the identical phase sequence with the
 * profiler off. An initialization fix that traded bytes for cycles would be
 * invisible to the sampled numbers, and the sampler's overhead makes a timed run
 * under it useless as a CPU reading.
 */
if (wantCpu) {
  const timings: Record<string, number> = {};
  const time = (name: string, body: () => void): void => {
    const started = performance.now();
    body();
    timings[name] = Number((performance.now() - started).toFixed(1));
  };

  let harness!: WebGl2Harness;
  let texture!: Texture;
  let root!: Container;

  time('harness', () => {
    harness = createWebGl2Harness();
  });
  time('textures', () => {
    texture = makeTextures(1)[0]!;
  });
  time('construct', () => {
    root = new Container();
    buildInto(root, texture, 0, count);
  });

  harness.view.reset(VIEW.w / 2, VIEW.h / 2, VIEW.w, VIEW.h);

  const beforeFrame = pingPongCamera(harness, 8);

  time('frame1', () => renderOnce(harness, root, beforeFrame));
  time('ramp', () => {
    for (let i = 1; i < rampFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });
  time('steadyWarmup', () => {
    for (let i = 0; i < steadyWarmup; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });
  time('steady', () => {
    for (let i = 0; i < steadyFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  root.destroy();
  harness.destroy();

  console.log(JSON.stringify({ mode: 'cpu', count, rampFrames, steadyFrames, timings }));
  process.exit(0);
}

let harness!: WebGl2Harness;
let texture!: Texture;
let root!: Container;

await phase('harness', () => {
  harness = createWebGl2Harness();
});

await phase('textures', () => {
  texture = makeTextures(1)[0]!;
});

if (incrementalChunks > 0) {
  // Streaming shape: the scene grows across frames instead of being fully built
  // before the first render. Answers whether a reserve/bulk-build path would
  // help a real loading screen or only a synthetic one-shot construction.
  const perChunk = Math.ceil(count / incrementalChunks);

  root = new Container();
  harness.view.reset(VIEW.w / 2, VIEW.h / 2, VIEW.w, VIEW.h);

  const beforeFrame = pingPongCamera(harness, 8);
  let built = 0;

  await phase('incrementalBuildAndRender', () => {
    for (let chunk = 0; chunk < incrementalChunks; chunk++) {
      const n = Math.min(perChunk, count - built);

      buildInto(root, texture, built, n);
      built += n;
      renderOnce(harness, root, beforeFrame);
    }
  });

  await phase('ramp', () => {
    for (let i = 0; i < rampFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  await phase('steadyWarmup', () => {
    for (let i = 0; i < steadyWarmup; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  await phase('steady', () => {
    for (let i = 0; i < steadyFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });
} else {
  await phase('construct', () => {
    root = new Container();
    buildInto(root, texture, 0, count);
  });

  // The fixture's own `Sprite[]`, measured on its own so the construction phase
  // reports engine cost rather than harness cost.
  await phase('fixtureArray', () => {
    const sprites: unknown[] = [];

    for (const child of root.children) {
      sprites.push(child);
    }

    if (sprites.length !== count) {
      throw new Error(`fixture array length ${sprites.length} != ${count}`);
    }
  });

  harness.view.reset(VIEW.w / 2, VIEW.h / 2, VIEW.w, VIEW.h);

  const beforeFrame = pingPongCamera(harness, 8);

  await phase('frame1', () => renderOnce(harness, root, beforeFrame));

  await phase('ramp', () => {
    for (let i = 1; i < rampFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  await phase('steadyWarmup', () => {
    for (let i = 0; i < steadyWarmup; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });

  await phase('steady', () => {
    for (let i = 0; i < steadyFrames; i++) {
      renderOnce(harness, root, beforeFrame);
    }
  });
}

const bootstrapBytes = phases.filter(p => p.phase !== 'steady' && p.phase !== 'steadyWarmup').reduce((total, p) => total + p.allocBytes, 0);
const steadyPhase = phases.find(p => p.phase === 'steady');

if (wantProfile) {
  for (const entry of phases) {
    process.stderr.write(`\n── ${entry.phase} — ${(entry.allocBytes / 1024 / 1024).toFixed(2)} MB ──\n`);

    for (const row of entry.callsites ?? []) {
      process.stderr.write(`${(row.selfBytes / 1024 / 1024).toFixed(2).padStart(9)} MB  ${row.site}\n`);
    }
  }
}

root.destroy();
harness.destroy();

console.log(
  JSON.stringify({
    mode: incrementalChunks > 0 ? 'incremental' : 'bulk',
    count,
    rampFrames,
    steadyFrames,
    samplingInterval,
    gcAvailable: gc !== undefined,
    bootstrapBytes,
    steadyBytesPerFrame: steadyPhase === undefined ? null : steadyPhase.allocBytes / steadyFrames,
    phases: phases.map(({ callsites: _callsites, ...rest }) => rest),
  }),
);
