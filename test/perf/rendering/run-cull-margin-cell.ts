/**
 * One capture-margin sweep cell, in a process of its own.
 *
 * Renders the `scrolling-world` scene at one (margin, nodeCount, cameraSpeed)
 * point and prints a single JSON object on stdout. One cell per process on
 * purpose: this scene's cost is the documented case where V8's optimisation
 * state carries across scenes inside a process and moves the reading by ~25%
 * (see the `scrolling-world/10000` note in `allocationScenes.ts`), so a sweep
 * that rendered every margin in one process would compare tier-up histories
 * rather than margins.
 *
 *   pnpm perf:renderers:cull-margin:cell -- --margin 0.0625 --nodes 25000 [--speed 8] [--frames 300] [--warmup 60]
 *
 * @internal Test/perf-only.
 */
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import {
  beginProbeFrame,
  buildScrollingWorld,
  captureCullRectOf,
  endProbeFrame,
  installCaptureMargin,
  installTierProbe,
  refusePersistentSlots,
  SCROLLING_WORLD,
  sourceItemCount,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  visibleLeafCount,
} from './cullMarginProbe';
import { createWebGl2Harness } from './harness';

const args = process.argv.slice(2);

const flag = (name: string, fallback: number): number => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? fallback : Number(args[index + 1]);
};

const margin = flag('margin', 1 / 16);
const nodes = flag('nodes', 25_000);
const speed = flag('speed', SCROLLING_WORLD.cameraSpeed);
const frames = flag('frames', 300);
const warmup = flag('warmup', 60);
const worldSpan = SCROLLING_WORLD.worldSpan;

installCaptureMargin(margin);

if (args.includes('--no-slots')) {
  refusePersistentSlots(WebGl2Backend.prototype);
}

const harness = createWebGl2Harness({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
const scene = buildScrollingWorld(harness, nodes, speed, worldSpan);
const { backend, recorder } = harness;

const renderFrame = (frame: number): void => {
  scene.step(frame);
  backend.resetStats();
  recorder.reset();
  backend.clear();
  scene.root.render(backend);
  backend.flush();
};

// Warmup is discarded: it settles the source build, the spatial index, the slot
// stores and the JIT, none of which a margin comparison is about.
for (let frame = 0; frame < warmup; frame++) {
  renderFrame(frame);
}

const gc = (globalThis as { gc?: () => void }).gc;

gc?.();

const heapBefore = process.memoryUsage().heapUsed;
const totals = installTierProbe();
const samples = new Float64Array(frames);
/** Timings split by which tier served the frame: the replay/miss contrast the sweep is about. */
const replaySamples: number[] = [];
const missSamples: number[] = [];

let submittedNodes = 0;
let culledNodes = 0;
let drawCalls = 0;
let instances = 0;
let bufferUploads = 0;
let uploadedBufferBytes = 0;

for (let i = 0; i < frames; i++) {
  const frame = warmup + i;

  beginProbeFrame();

  const start = performance.now();

  renderFrame(frame);

  const elapsed = performance.now() - start;

  samples[i] = elapsed;

  const served = endProbeFrame(scene.root);

  // Both tiers have a cheap "the margin still holds" answer and an expensive
  // "it does not" one; the split is by that, not by which tier answered.
  if (served === 'slotReplay' || served === 'captureReplay') {
    replaySamples.push(elapsed);
  } else {
    missSamples.push(elapsed);
  }

  submittedNodes += backend.stats.submittedNodes;
  culledNodes += backend.stats.culledNodes;
  drawCalls += backend.stats.drawCalls;
  instances += recorder.instances;
  bufferUploads += recorder.bufferUploads;
  uploadedBufferBytes += recorder.bufferUploadBytes;
}

const heapAfter = process.memoryUsage().heapUsed;

const sorted = Float64Array.from(samples).sort();
const at = (percentile: number): number => sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)]!;

/** Count, median, mean and worst of one tier's frames - `null` when it served none. */
const summarize = (values: readonly number[]): { count: number; median: number; mean: number; max: number } | null => {
  if (values.length === 0) {
    return null;
  }

  const ordered = [...values].sort((a, b) => a - b);

  return {
    count: ordered.length,
    median: ordered[Math.floor(ordered.length / 2)]!,
    mean: ordered.reduce((a, b) => a + b, 0) / ordered.length,
    max: ordered[ordered.length - 1]!,
  };
};

// The on-screen truth the capture is compared against, averaged over the same
// window: the analytic count, so it is a property of the archetype rather than
// of whichever tier answered the frame.
let visibleTotal = 0;

for (let i = 0; i < frames; i++) {
  visibleTotal += visibleLeafCount(nodes, warmup + i, speed, worldSpan);
}

const cullRect = captureCullRectOf(scene.root);

process.stdout.write(
  `${JSON.stringify({
    margin,
    nodes,
    speed,
    frames,
    warmup,
    noSlots: args.includes('--no-slots'),
    captureAreaFactor: (1 + 2 * margin) ** 2,
    marginPixelsX: VIEWPORT_WIDTH * margin,
    marginPixelsY: VIEWPORT_HEIGHT * margin,
    tiers: totals.tiers,
    query: totals.query,
    sourceItems: sourceItemCount(scene.root),
    cullRect: cullRect === null ? null : { width: cullRect.width, height: cullRect.height },
    perFrame: {
      submittedNodes: submittedNodes / frames,
      culledNodes: culledNodes / frames,
      drawCalls: drawCalls / frames,
      visibleLeaves: visibleTotal / frames,
      instances: instances / frames,
      bufferUploads: bufferUploads / frames,
      uploadedBufferBytes: uploadedBufferBytes / frames,
    },
    cpuMs: { median: at(50), p95: at(95), max: sorted[sorted.length - 1]!, mean: samples.reduce((a, b) => a + b, 0) / frames },
    replayMs: summarize(replaySamples),
    missMs: summarize(missSamples),
    heapDeltaBytes: heapAfter - heapBefore,
  })}\n`,
);

scene.destroy();
harness.destroy();
