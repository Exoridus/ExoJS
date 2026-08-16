import { ARCHETYPES } from '../src/rendering/archetypes';
import type { Backend, CellSpec, EngineAdapter } from '../src/rendering/EngineAdapter';
import { runCell } from '../src/rendering/page/harness';
import { mutationSignature,selectMutationIndices } from '../src/shared/mutation';

/** The harness's own fixed RNG seed (`page/harness.ts`), mirrored so the fake arm reports the signature it expects. */
const SEED = 0xc0ffee;

/** Archetype every cell in this file runs; only its mutation fraction matters to the fake arm. */
const ARCHETYPE = ARCHETYPES.find(archetype => archetype.id === 'static-heavy')!;

/**
 * One line per observable event, in the order the harness produced it. The
 * whole point of these tests is the ORDER, so the recorder is shared and the
 * assertions compare full sequences rather than counts.
 */
type EventLog = string[];

interface FakeArm {
  readonly adapter: EngineAdapter;
  readonly events: EventLog;
  /** Resolves the next `onSubmittedWorkDone()` only after `ms` of real time. */
  queueLatencyMs: number;
}

/**
 * A minimal WebGPU arm: it renders nothing, but it logs a `submit` for every
 * `renderFrame` and a `queue-wait` for every `onSubmittedWorkDone()` the harness
 * asks the device queue for. `gpuDevice()` returns `null` when `withDevice` is
 * false, which is the documented degrade path for an arm that does not surface
 * its device.
 */
const createFakeArm = (withDevice = true): FakeArm => {
  const events: EventLog = [];
  const arm: { queueLatencyMs: number } = { queueLatencyMs: 0 };

  const queue = {
    onSubmittedWorkDone: async (): Promise<void> => {
      events.push('queue-wait');

      if (arm.queueLatencyMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, arm.queueLatencyMs));
      }
    },
  };

  const device = { queue } as unknown as GPUDevice;

  const adapter: EngineAdapter = {
    engine: 'fake',
    config: 'current',
    supports: (backend: Backend) => backend === 'webgpu',
    init: async () => {
      /* no real device to create */
    },
    buildScene: () => {
      /* no scene */
    },
    mutate: () => {
      /* no mutation */
    },
    renderFrame: () => {
      events.push('submit');
    },
    teardown: () => {
      events.push('teardown');
    },
    mutationSignature: () => mutationSignature(selectMutationIndices(0, ARCHETYPE.mutationFraction, SEED)),
    gpuDevice: () => (withDevice ? device : null),
  };

  return {
    adapter,
    events,
    get queueLatencyMs(): number {
      return arm.queueLatencyMs;
    },
    set queueLatencyMs(value: number) {
      arm.queueLatencyMs = value;
    },
  };
};

/**
 * A WebGL2 arm that exposes no timer extension — the usual case, since browsers
 * gate `EXT_disjoint_timer_query_webgl2` behind a privacy policy. It logs the
 * same `submit` events so a WebGL2 cell's sequence can be compared against a
 * WebGPU one directly.
 */
const createFakeWebGl2Arm = (): { adapter: EngineAdapter; events: EventLog; canvas: HTMLCanvasElement } => {
  const events: EventLog = [];
  const gl = {
    getExtension: () => null,
    drawArrays: () => undefined,
    drawElements: () => undefined,
    bindTexture: () => undefined,
    bufferData: () => undefined,
    bufferSubData: () => undefined,
  };
  const canvas = { getContext: (id: string) => (id === 'webgl2' ? gl : null) } as unknown as HTMLCanvasElement;

  const adapter: EngineAdapter = {
    engine: 'fake',
    config: 'current',
    supports: (backend: Backend) => backend === 'webgl2',
    init: async () => {
      /* no real context to create */
    },
    buildScene: () => {
      /* no scene */
    },
    mutate: () => {
      /* no mutation */
    },
    renderFrame: () => {
      events.push('submit');
    },
    teardown: () => {
      events.push('teardown');
    },
    mutationSignature: () => mutationSignature(selectMutationIndices(0, ARCHETYPE.mutationFraction, SEED)),
  };

  return { adapter, events, canvas };
};

const cell = (backend: Backend, warmupFrames: number, timedFrames: number): CellSpec => ({
  engine: 'fake',
  config: 'current',
  backend,
  archetype: ARCHETYPE.id,
  // Zero nodes: the fake arm draws nothing, and the harness's zero-draw
  // structural self-check is (correctly) restricted to non-empty scenes.
  nodeCount: 0,
  timedFrames,
  warmupFrames,
});

const stageCanvas = (): HTMLCanvasElement => document.createElement('canvas');

describe('WebGPU warmup/timing measurement boundary', () => {
  test('drains the queue exactly once, after the last warmup submit and before the first timed submit', async () => {
    const arm = createFakeArm();

    await runCell(arm.adapter, cell('webgpu', 3, 2), stageCanvas());

    // The contract in full. The single `queue-wait` between the warmup block and
    // the first timed submit IS the measurement boundary: any warmup work is off
    // the queue before a timed frame's cumulative `onSubmittedWorkDone` bracket
    // opens. Each timed frame then contributes its own submit/wait pair.
    expect(arm.events).toEqual([
      'submit',
      'submit',
      'submit',
      'queue-wait',
      'submit',
      'queue-wait',
      'submit',
      'queue-wait',
      'teardown',
    ]);
  });

  test('never charges a timed frame with work submitted during warmup', async () => {
    const arm = createFakeArm();

    await runCell(arm.adapter, cell('webgpu', 5, 1), stageCanvas());

    const firstWait = arm.events.indexOf('queue-wait');
    const warmupSubmits = arm.events.slice(0, firstWait);

    // Stated as the invariant rather than as a fixed sequence, so this test keeps
    // failing for the right reason if the frame counts above ever change: every
    // warmup submit precedes the first completion wait. The regression this
    // guards against is the reverse order — warmup, timed frame, and only THEN a
    // wait that resolves on the warmup backlog too.
    expect(warmupSubmits).toEqual(['submit', 'submit', 'submit', 'submit', 'submit']);
    expect(arm.events[firstWait + 1]).toBe('submit');
  });

  test('drains even when the warmup is cut short by its wall-clock budget', async () => {
    const arm = createFakeArm();
    const realNow = performance.now.bind(performance);
    // WARMUP_BUDGET_MS is 10s of wall clock, so the truncation path is only
    // reachable through the clock. Two big jumps put the second warmup check past
    // the deadline; every later reading advances by a hair so the timed frames
    // stay far below the abort thresholds.
    const jumps = [0, 6_000, 6_000];
    let elapsed = 0;
    let call = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
      elapsed += jumps[call++] ?? 0.01;

      return realNow() + elapsed;
    });

    try {
      await runCell(arm.adapter, cell('webgpu', 40, 1), stageCanvas());
    } finally {
      nowSpy.mockRestore();
    }

    // Two warmup frames ran instead of the requested 40, and the boundary drain
    // still happened before the timed frame.
    expect(arm.events).toEqual(['submit', 'submit', 'queue-wait', 'submit', 'queue-wait', 'teardown']);
  });

  test('keeps the boundary drain out of the reported CPU time', async () => {
    const arm = createFakeArm();

    arm.queueLatencyMs = 60;

    const result = await runCell(arm.adapter, cell('webgpu', 2, 3), stageCanvas());

    // `cpuMs*` brackets `mutate` + `renderFrame` only. A 60ms drain (plus a 60ms
    // wait per timed frame) must not appear in it — the fake arm's frames are
    // empty, so anything beyond a fraction of a millisecond is the drain leaking
    // into the measurement.
    expect(result.cpuMsMedian).toBeLessThan(10);
    expect(result.cpuMsP95).toBeLessThan(10);
  });

  test('degrades without a drain when the arm exposes no GPUDevice', async () => {
    const arm = createFakeArm(false);

    const result = await runCell(arm.adapter, cell('webgpu', 2, 2), stageCanvas());

    expect(arm.events).toEqual(['submit', 'submit', 'submit', 'submit', 'teardown']);
    expect(result.status).toBe('ok');
    expect(result.note).toContain('exposed no GPUDevice');
  });
});

describe('WebGL2 cells', () => {
  test('run the same frame schedule with no completion wait at the boundary', async () => {
    const arm = createFakeWebGl2Arm();

    const result = await runCell(arm.adapter, cell('webgl2', 3, 2), arm.canvas);

    // A `TIME_ELAPSED` query cannot inherit a backlog, and the rAF-delta fallback
    // measures presentation cadence, so neither has anything to drain. The fix is
    // WebGPU-only by construction: this sequence is byte-for-byte what it was
    // before the boundary existed.
    expect(arm.events).toEqual(['submit', 'submit', 'submit', 'submit', 'submit', 'teardown']);
    expect(result.status).toBe('ok');
    expect(result.note).toContain('no GPU timer');
  });

  test('report no queue series at all', async () => {
    const arm = createFakeWebGl2Arm();

    const result = await runCell(arm.adapter, cell('webgl2', 1, 3), arm.canvas);

    // `queueMs*` is a WebGPU-only measurement. A WebGL2 row must carry nulls
    // rather than a value borrowed from another mechanism.
    expect(result.queueMsMedian).toBeNull();
    expect(result.queueMsP95).toBeNull();
  });
});

/** One entry per render pass the fake device saw: the injected query pair, or null when none was injected. */
type TimestampWrite = { begin: number; end: number } | null;
type TimestampWriteLog = TimestampWrite[];

/**
 * A WebGPU device that models the two things the timer depends on:
 *
 * 1. a FIFO queue whose `onSubmittedWorkDone` resolves on CUMULATIVE completion
 *    (`busyUntil = max(now, busyUntil) + work`), which is what makes one slow
 *    frame resolve the promises of the frames submitted behind it;
 * 2. a `timestamp-query` feature plus render passes that honour the
 *    `timestampWrites` the harness injects, so the resolved query buffer carries
 *    the GPU durations the test dictates.
 *
 * Both are behavioural: nothing here inspects harness source.
 */
const createFakeWebGpuDevice = (options: {
  /** Queue work (ms) consumed by successive `onSubmittedWorkDone()` calls, drain call first. */
  readonly queueWorkMs: readonly number[];
  /** GPU pass duration (ms) for successive render passes; the last value repeats. */
  readonly passMs?: readonly number[];
  /** Whether the device advertises `timestamp-query`. */
  readonly timestamps?: boolean;
}): { device: GPUDevice; timestampWritesSeen: TimestampWriteLog } => {
  const timestampWritesSeen: TimestampWriteLog = [];
  // Query values the fake "GPU" wrote, in nanoseconds, indexed by query slot.
  const values = new Map<number, bigint>();
  let clockNs = 1_000_000n;
  let passIndex = 0;
  let busyUntil = 0;
  let queueCall = 0;

  const buffer = (): GPUBuffer =>
    ({
      mapAsync: async (): Promise<void> => {
        /* resolved immediately: the fake GPU has nothing to wait for */
      },
      getMappedRange: (offset: number, size: number): ArrayBuffer => {
        const out = new BigUint64Array(size / 8);

        for (let index = 0; index < out.length; index++) {
          out[index] = values.get(offset / 8 + index) ?? 0n;
        }

        return out.buffer;
      },
      unmap: (): void => {
        /* nothing pinned */
      },
    }) as unknown as GPUBuffer;

  const device = {
    features: options.timestamps === false ? new Set<string>() : new Set(['timestamp-query']),
    createQuerySet: (): unknown => ({ destroy: (): void => undefined }),
    createBuffer: (): GPUBuffer => buffer(),
    createCommandEncoder: (): GPUCommandEncoder =>
      ({
        beginRenderPass: (descriptor: GPURenderPassDescriptor): GPURenderPassEncoder => {
          const writes = (descriptor as unknown as Record<string, unknown>)['timestampWrites'] as { beginningOfPassWriteIndex: number; endOfPassWriteIndex: number } | undefined;

          if (writes === undefined) {
            timestampWritesSeen.push(null);
          } else {
            const durationMs = options.passMs?.[Math.min(passIndex, (options.passMs.length ?? 1) - 1)] ?? 0;

            values.set(writes.beginningOfPassWriteIndex, clockNs);
            clockNs += BigInt(Math.round(durationMs * 1e6));
            values.set(writes.endOfPassWriteIndex, clockNs);
            // A gap between passes, so a frame's SUM of pass intervals and the
            // span from its first begin to its last end are distinguishable.
            clockNs += 1_000n;
            timestampWritesSeen.push({ begin: writes.beginningOfPassWriteIndex, end: writes.endOfPassWriteIndex });
            // Advanced only for TIMED passes, so `passMs[i]` addresses the i-th
            // measured pass regardless of how many warmup frames preceded it.
            passIndex++;
          }

          return { end: (): void => undefined } as unknown as GPURenderPassEncoder;
        },
        resolveQuerySet: (): void => undefined,
        copyBufferToBuffer: (): void => undefined,
        finish: (): GPUCommandBuffer => ({}) as GPUCommandBuffer,
      }) as unknown as GPUCommandEncoder,
    queue: {
      submit: (): void => undefined,
      onSubmittedWorkDone: async (): Promise<void> => {
        const now = performance.now();
        const work = options.queueWorkMs[queueCall++] ?? 0;

        busyUntil = Math.max(now, busyUntil) + work;

        const delay = busyUntil - now;

        // Only a POSITIVE remaining interval goes through a timer: Windows'
        // ~15ms timer granularity would otherwise turn "already complete" into a
        // 15ms sample and swamp the millisecond-scale assertions below.
        if (delay > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
      },
    },
  } as unknown as GPUDevice;

  return { device, timestampWritesSeen };
};

/** A WebGPU arm that renders through the fake device, so pass injection is exercised. */
const createRenderingArm = (device: GPUDevice, passesPerFrame = 1): EngineAdapter => ({
  engine: 'fake',
  config: 'current',
  supports: (backend: Backend) => backend === 'webgpu',
  init: async () => {
    /* no real device to create */
  },
  buildScene: () => {
    /* no scene */
  },
  mutate: () => {
    /* no mutation */
  },
  renderFrame: () => {
    for (let pass = 0; pass < passesPerFrame; pass++) {
      const encoder = device.createCommandEncoder();

      encoder.beginRenderPass({ colorAttachments: [] }).end();
      device.queue.submit([encoder.finish()]);
    }
  },
  teardown: () => {
    /* nothing to tear down */
  },
  mutationSignature: () => mutationSignature(selectMutationIndices(0, ARCHETYPE.mutationFraction, SEED)),
  gpuDevice: () => device,
});

describe('WebGPU frame time comes from the hardware timestamp clock', () => {
  const gpuGlobals = globalThis as unknown as Record<string, unknown>;

  beforeAll(() => {
    // Real browser globals the timer reads; absent in the test environment.
    gpuGlobals['GPUBufferUsage'] = { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 };
    gpuGlobals['GPUMapMode'] = { READ: 1 };
  });

  afterAll(() => {
    delete gpuGlobals['GPUBufferUsage'];
    delete gpuGlobals['GPUMapMode'];
  });

  test('reports pass execution as frameMs and queue occupancy as queueMs, from the same frames', async () => {
    // 40ms of queue work per timed frame against 2ms of pass execution: the two
    // columns MUST disagree, and each must report its own quantity. This is the
    // whole design decision in one assertion — the queue wall clock is not the
    // frame time, and the frame time cannot see the queue.
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0, 40, 40, 40], passMs: [2] });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 2, 3), stageCanvas());

    expect(result.frameMsMedian).toBeCloseTo(2, 3);
    expect(result.frameMsP95).toBeCloseTo(2, 3);
    expect(result.queueMsMedian).toBeGreaterThan(30);
    expect(result.note).toContain('timestamp-query');
    expect(result.note).toContain('queueMs*');
  });

  test('produces exactly one frame-time sample per timed frame, in frame order', async () => {
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0], passMs: [1, 2, 3, 4, 5] });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 1, 5), stageCanvas());

    // Five frames, five samples: nearest-rank median is the 3rd and p95 the 5th.
    // A dropped or duplicated sample moves both.
    expect(result.frameMsMedian).toBeCloseTo(3, 3);
    expect(result.frameMsP95).toBeCloseTo(5, 3);
  });

  test('sums every render pass a frame encodes', async () => {
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0], passMs: [1.5] });

    const result = await runCell(createRenderingArm(device, 3), cell('webgpu', 1, 3), stageCanvas());

    // Three passes of 1.5ms each: the frame's GPU time is their sum, not the
    // first pass and not the span (which would include the inter-pass gaps).
    expect(result.frameMsMedian).toBeCloseTo(4.5, 3);
  });

  test('injects timestamp writes only inside the timed window', async () => {
    const { device, timestampWritesSeen } = createFakeWebGpuDevice({ queueWorkMs: [0], passMs: [1] });

    await runCell(createRenderingArm(device), cell('webgpu', 3, 2), stageCanvas());

    // Warmup passes carry no writes; timed passes do. The engine REUSES one
    // render-pass descriptor, so a stale `timestampWrites` surviving out of the
    // window would silently overwrite recorded query values — this pins that the
    // wrapper clears the member instead of leaving it.
    expect(timestampWritesSeen.slice(0, 3)).toEqual([null, null, null]);
    expect(timestampWritesSeen.slice(3, 5).every(entry => entry !== null)).toBe(true);
    // Every timed pass gets its OWN query pair: reusing an index inside one
    // submit is a validation error, and across submits it would overwrite.
    const indices = timestampWritesSeen.filter((entry): entry is { begin: number; end: number } => entry !== null).flatMap(entry => [entry.begin, entry.end]);

    expect(new Set(indices).size).toBe(indices.length);
  });

  test('falls back to the rAF delta, never to the queue clock, when the device has no timestamp-query', async () => {
    const { device, timestampWritesSeen } = createFakeWebGpuDevice({ queueWorkMs: [0, 40, 40], timestamps: false });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 1, 2), stageCanvas());

    expect(timestampWritesSeen.every(entry => entry === null)).toBe(true);
    expect(result.note).toContain('no GPU timer');
    expect(result.note).toContain('no timestamp-query feature');
    // The queue series is still reported — it is the only signal that sees
    // upload cost — but it did not become the frame time.
    expect(result.queueMsMedian).toBeGreaterThan(30);
    expect(result.frameMsMedian).not.toBeCloseTo(result.queueMsMedian!, 0);
  });
});

describe('WebGPU queue occupancy is attributed to the frame that caused it', () => {
  const gpuGlobals = globalThis as unknown as Record<string, unknown>;

  beforeAll(() => {
    gpuGlobals['GPUBufferUsage'] = { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 };
    gpuGlobals['GPUMapMode'] = { READ: 1 };
  });

  afterAll(() => {
    delete gpuGlobals['GPUBufferUsage'];
    delete gpuGlobals['GPUMapMode'];
  });

  test('one slow frame followed by two cheap ones is counted once, not three times', async () => {
    // The acceptance case: frame A occupies the queue for 200ms, B and C for 20ms
    // each. Their cumulative completions all resolve behind A's, so the RAW
    // `doneAt − submitAt` would report ~200 / ~185 / ~170 and put the median at
    // ~185. The intervals are tens of milliseconds because the fake queue sleeps
    // on a real timer, whose granularity on Windows is ~15ms.
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0, 200, 20, 20], passMs: [0.1] });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 1, 3), stageCanvas());

    // Attributed: the 200ms event stays on A (so p95 over three samples still
    // sees it) and B/C report their own 20ms, so the median collapses.
    expect(result.queueMsP95).toBeGreaterThan(150);
    expect(result.queueMsMedian).toBeLessThan(80);
  });

  test('completions observed at the same instant never produce a negative sample', async () => {
    // B and C add NO work, so all three promises resolve at the same instant —
    // the coalescing case. The attributed value for a frame whose completion
    // coincides with its predecessor's is a lower bound (here ~0), which is the
    // documented cost of not counting A's stall three times.
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0, 200, 0, 0], passMs: [0.1] });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 1, 3), stageCanvas());

    expect(result.queueMsMedian).toBeGreaterThanOrEqual(0);
    expect(result.queueMsMedian).toBeLessThan(80);
    expect(result.queueMsP95).toBeGreaterThan(150);
  });

  test('an isolated frame is charged its full queue interval', async () => {
    // No overlap: each frame's submit follows the previous completion, so the
    // attribution must be a no-op and every sample equal to its own work.
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0, 60, 60, 60], passMs: [0.1] });

    const result = await runCell(createRenderingArm(device), cell('webgpu', 1, 3), stageCanvas());

    expect(result.queueMsMedian).toBeGreaterThan(40);
    expect(result.queueMsMedian).toBeLessThan(120);
  });
});

describe('abort path', () => {
  const gpuGlobals = globalThis as unknown as Record<string, unknown>;

  beforeAll(() => {
    gpuGlobals['GPUBufferUsage'] = { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 };
    gpuGlobals['GPUMapMode'] = { READ: 1 };
  });

  afterAll(() => {
    delete gpuGlobals['GPUBufferUsage'];
    delete gpuGlobals['GPUMapMode'];
  });

  test('a single catastrophic frame aborts the cell and still reports both timing series', async () => {
    const { device } = createFakeWebGpuDevice({ queueWorkMs: [0, 1, 1], passMs: [1] });
    const base = createRenderingArm(device);
    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const adapter: EngineAdapter = {
      ...base,
      // 2500ms of apparent CPU per frame: past HARD_FRAME_BUDGET_MS (10x the
      // 200ms budget), so the cell aborts after the FIRST timed frame.
      renderFrame: () => {
        base.renderFrame();
        clock += 2500;
      },
    };

    try {
      const result = await runCell(adapter, cell('webgpu', 1, 5), stageCanvas());

      expect(result.status).toBe('exceeded');
      expect(result.note).toContain('hard cap');
      // The abort must not cost the cell its measurement: one frame ran, so one
      // sample of each series exists.
      expect(result.frameMsMedian).toBeCloseTo(1, 3);
      expect(result.queueMsMedian).not.toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
