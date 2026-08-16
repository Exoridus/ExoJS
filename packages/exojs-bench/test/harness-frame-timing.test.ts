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
});
