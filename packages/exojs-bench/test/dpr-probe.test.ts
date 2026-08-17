import { describe, expect, test } from 'vitest';

import { createTargetRecorder, instrumentAcquireRenderTexture, instrumentCacheTexture } from '../src/rendering/dpr-probe/instrumentation';
import type { ProbeCellResult, ProbeResult } from '../src/rendering/dpr-probe/matrix';
import {
  buildProbeMatrix,
  internalToMainPixelRatio,
  PROBE_PIXEL_RATIOS,
  PROBE_SCENES,
  PROBE_SCHEMA_VERSION,
  serializeProbeResult,
  totalInternalTargetPixels,
} from '../src/rendering/dpr-probe/matrix';
import { createWebGpuGpuTimer, WEBGPU_NO_TIMESTAMP_NOTE } from '../src/rendering/page/gpuFrameTimer';

/**
 * Node-side tests for the `NEU-S4` DPR probe.
 *
 * Everything asserted here is the part that decides whether a capture taken on a
 * phone can be read at all: the run order, the internal-target instrumentation,
 * the separation between the production contract and the probe arm, and the
 * degrade path when the device has no hardware GPU clock. The engine-touching
 * halves (`scenes.ts`, `runner.ts`) need a real GPU and are exercised by the
 * probe itself on the device.
 */

describe('probe matrix', () => {
  test('covers every scene at every pixel ratio, with a probe arm only where an internal target exists', () => {
    const cells = buildProbeMatrix();
    const withTarget = PROBE_SCENES.filter(scene => scene.usesInternalTarget).length;
    const withoutTarget = PROBE_SCENES.length - withTarget;

    expect(cells).toHaveLength((withTarget * 2 + withoutTarget) * PROBE_PIXEL_RATIOS.length);

    for (const scene of PROBE_SCENES) {
      const modes = new Set(cells.filter(cell => cell.scene === scene.id).map(cell => cell.mode));

      expect([...modes].sort()).toEqual(scene.usesInternalTarget ? ['inherit', 'logical'] : ['inherit']);
    }
  });

  test('orders cells scene, then mode, then ASCENDING pixel ratio so the four ratios of one arm are adjacent', () => {
    const cells = buildProbeMatrix();

    // Group boundaries are (scene, mode) changes; inside a group the ratios must
    // be the full list, in ascending order. That adjacency is what stops a slow
    // thermal drift from being read as a DPR cost.
    const groups: number[][] = [];

    for (const cell of cells) {
      const previous = groups[groups.length - 1];
      const isNewGroup =
        previous === undefined ||
        cells[cells.indexOf(cell) - 1]?.scene !== cell.scene ||
        cells[cells.indexOf(cell) - 1]?.mode !== cell.mode;

      if (isNewGroup) {
        groups.push([cell.pixelRatio]);
      } else {
        previous.push(cell.pixelRatio);
      }
    }

    for (const group of groups) {
      expect(group).toEqual([...PROBE_PIXEL_RATIOS]);
    }
  });

  test('is deterministic — two builds produce the identical order', () => {
    expect(buildProbeMatrix()).toEqual(buildProbeMatrix());
  });
});

/** A backend stand-in that records the sizes it was asked to allocate. */
const createFakeBackend = (): { acquireRenderTexture: (width: number, height: number) => unknown; calls: [number, number][] } => {
  const calls: [number, number][] = [];

  return {
    calls,
    acquireRenderTexture(width: number, height: number): unknown {
      calls.push([width, height]);

      return { width, height };
    },
  };
};

/** A `cacheAsTexture` node stand-in with the same recording behaviour. */
const createFakeCacheNode = (): { _renderPlanEnsureCacheTexture: (width: number, height: number) => unknown; calls: [number, number][] } => {
  const calls: [number, number][] = [];

  return {
    calls,
    _renderPlanEnsureCacheTexture(width: number, height: number): unknown {
      calls.push([width, height]);

      return { width, height };
    },
  };
};

describe('internal-target instrumentation', () => {
  test('records the texel size the engine allocated, and changes nothing about it', () => {
    const backend = createFakeBackend();
    const recorder = createTargetRecorder();
    const restore = instrumentAcquireRenderTexture(backend, recorder);

    recorder.arm();
    backend.acquireRenderTexture(608, 644);
    recorder.disarm();
    restore();

    // Passed straight through: the engine sizes its own targets since NEU-S4,
    // and a probe that resized them would stop measuring the production path.
    expect(backend.calls).toEqual([[608, 644]]);
    expect(recorder.summary()).toEqual([{ kind: 'pooled', width: 608, height: 644, count: 1 }]);
  });

  test('the cache texture is recorded the same way and tagged apart from pooled targets', () => {
    const node = createFakeCacheNode();
    const recorder = createTargetRecorder();
    const restore = instrumentCacheTexture(node, recorder);

    recorder.arm();
    node._renderPlanEnsureCacheTexture(592, 406);
    recorder.disarm();
    restore();

    expect(node.calls).toEqual([[592, 406]]);
    expect(recorder.summary()).toEqual([{ kind: 'cache', width: 592, height: 406, count: 1 }]);
  });

  test('restoring puts the original method back, so the probe cannot leak into a later cell', () => {
    const backend = createFakeBackend();
    const recorder = createTargetRecorder();
    const restore = instrumentAcquireRenderTexture(backend, recorder);

    restore();
    recorder.arm();
    backend.acquireRenderTexture(64, 64);

    expect(backend.calls).toEqual([[64, 64]]);
    expect(recorder.summary()).toEqual([]);
  });

  test('records nothing while disarmed, and aggregates repeats of one shape into a count', () => {
    const backend = createFakeBackend();
    const recorder = createTargetRecorder();

    instrumentAcquireRenderTexture(backend, recorder);

    backend.acquireRenderTexture(10, 10);
    expect(recorder.summary()).toEqual([]);

    recorder.arm();
    backend.acquireRenderTexture(10, 10);
    backend.acquireRenderTexture(10, 10);
    backend.acquireRenderTexture(20, 20);
    recorder.disarm();

    expect(recorder.summary()).toEqual([
      { kind: 'pooled', width: 10, height: 10, count: 2 },
      { kind: 'pooled', width: 20, height: 20, count: 1 },
    ]);
  });

  test('arming again drops what a previous window captured', () => {
    const backend = createFakeBackend();
    const recorder = createTargetRecorder();

    instrumentAcquireRenderTexture(backend, recorder);
    recorder.arm();
    backend.acquireRenderTexture(10, 10);
    recorder.arm();
    backend.acquireRenderTexture(20, 20);
    recorder.disarm();

    expect(recorder.summary().map(record => record.width)).toEqual([20]);
  });
});

describe('internal-target pixel accounting', () => {
  test('counts every allocation, so a two-pass filter chain costs twice', () => {
    expect(totalInternalTargetPixels([{ kind: 'pooled', width: 100, height: 100, count: 2 }])).toBe(20_000);
  });

  test('reproduces the finding the probe was built for, and the fix', () => {
    // A 200x200 logical barrier on a 360x360 CSS stage at DPR 2: the surface is
    // 720x720 device pixels. Pinned to resolution 1 the target covers a quarter
    // of the pixels it is sampled over; inheriting, it covers all of them.
    const pinned = [{ kind: 'pooled' as const, width: 200, height: 200, count: 1 }];
    const inherited = [{ kind: 'pooled' as const, width: 400, height: 400, count: 1 }];

    expect(internalToMainPixelRatio(pinned, 720 * 720) ?? 0).toBeCloseTo((200 * 200) / (720 * 720), 10);
    expect((internalToMainPixelRatio(inherited, 720 * 720) ?? 0) / (internalToMainPixelRatio(pinned, 720 * 720) ?? 1)).toBeCloseTo(4, 10);
  });

  test('is null rather than zero when a cell allocated no internal target', () => {
    expect(internalToMainPixelRatio([], 1000)).toBeNull();
    expect(internalToMainPixelRatio([{ kind: 'cache', width: 1, height: 1, count: 1 }], 0)).toBeNull();
  });
});

/** A minimal capture used to pin the serialized shape. */
const sampleCell: ProbeCellResult = {
  index: 0,
  startOffsetMs: 12.5,
  scene: 'blur',
  mode: 'inherit',
  configuredPixelRatio: 3,
  enginePixelRatio: 3,
  cssWidth: 360,
  cssHeight: 360,
  backingWidth: 1080,
  backingHeight: 1080,
  mainPixelCount: 1_166_400,
  internalTargets: [{ kind: 'pooled', width: 600, height: 600, count: 2 }],
  internalToMainPixelRatio: 0.617,
  warmupFrames: 40,
  measuredFrames: 360,
  measuredMs: 6001.2,
  cpuMsMedian: 1.25,
  cpuMsP95: 2.5,
  gpuMsMedian: null,
  gpuMsP95: null,
  rafDeltaMsMedian: 16.67,
  rafDeltaMsP95: 17.1,
  errors: [],
};

const sampleResult: ProbeResult = {
  schemaVersion: PROBE_SCHEMA_VERSION,
  gitSha: '5f0ac744eea8d9d3fa5830ba1416fa6ab13ef01c',
  engineVersion: '0.15.2',
  timestamp: '2026-08-17T10:00:00.000Z',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X)',
  deviceLabel: 'iPhone 13 Pro',
  testerNote: 'cold device, portrait',
  devicePixelRatio: 3,
  engineAutoPixelRatio: 2,
  backendRequested: 'auto',
  backendSelected: 'webgl2',
  webgpuTimestampQuery: null,
  gpuTimerSource: 'none',
  crossOriginIsolated: true,
  timerResolutionMs: 0.005,
  stageWidth: 360,
  stageHeight: 360,
  stagePreset: 'fixed',
  cells: [sampleCell],
  notes: ['bench-only probe'],
};

describe('result serialization', () => {
  test('round-trips without losing a field', () => {
    expect(JSON.parse(serializeProbeResult(sampleResult))).toEqual(sampleResult);
  });

  test('keeps a missing GPU time as null rather than dropping the column', () => {
    const parsed = JSON.parse(serializeProbeResult(sampleResult)) as ProbeResult;

    expect(parsed.cells[0]).toHaveProperty('gpuMsMedian', null);
    expect(parsed.cells[0]).toHaveProperty('gpuMsP95', null);
  });

  test('records the device name the tester typed, never anything parsed out of the user agent', () => {
    const parsed = JSON.parse(serializeProbeResult(sampleResult)) as ProbeResult;

    expect(parsed.deviceLabel).toBe('iPhone 13 Pro');
    expect(parsed.userAgent).toContain('iPhone');
    // The UA names no model; nothing in the record may claim otherwise.
    expect(parsed.userAgent).not.toContain('13 Pro');
  });

  test('carries the run order and offsets so a thermal drift stays auditable', () => {
    const parsed = JSON.parse(serializeProbeResult(sampleResult)) as ProbeResult;

    expect(parsed.cells[0]).toHaveProperty('index', 0);
    expect(parsed.cells[0]).toHaveProperty('startOffsetMs', 12.5);
  });
});

/** A device that grants no `timestamp-query`, i.e. the iOS/WebKit expectation. */
const createDeviceWithoutTimestampQuery = (): GPUDevice =>
  ({
    features: new Set<string>(),
    queue: {
      async onSubmittedWorkDone(): Promise<void> {
        /* resolves immediately */
      },
    },
  }) as unknown as GPUDevice;

describe('missing timestamp-query', () => {
  test('reports no hardware clock instead of substituting the queue wall clock', async () => {
    const timer = createWebGpuGpuTimer(createDeviceWithoutTimestampQuery());

    expect(timer.available).toBe(false);
    expect(timer.note).toBe(WEBGPU_NO_TIMESTAMP_NOTE);

    await timer.drainSubmittedWork();
    timer.beginFrame();
    timer.endFrame();

    const samples = await timer.collect();

    // No fabricated GPU time — the frame series stays empty. The queue series is
    // still gathered, because it measures a different thing and says so.
    expect(samples.frameMs).toEqual([]);
    expect(samples.queueMs).toHaveLength(1);
  });
});
