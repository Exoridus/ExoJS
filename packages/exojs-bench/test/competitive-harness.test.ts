import type { CellSpec, EngineAdapter } from '../src/rendering/EngineAdapter';
import { runCell } from '../src/rendering/page/harness';
import { mutationSignature, selectMutationIndices } from '../src/shared/mutation';

const spec: CellSpec = {
  engine: 'fake',
  config: 'current',
  backend: 'webgl2',
  archetype: 'dirty-10',
  nodeCount: 1000,
  timedFrames: 5,
  warmupFrames: 2,
  measurement: { profile: 'timing' },
};

describe('competitive harness acquisition', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('retains raw samples and independent cadence while timing mode avoids graphics probes', async () => {
    let timestamp = 0;
    let mutations = 0;
    let rendered = 0;
    let tornDown = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      timestamp += 16.7;
      queueMicrotask(() => callback(timestamp));

      return 1;
    });
    const adapter: EngineAdapter = {
      engine: 'fake',
      config: 'current',
      supports: () => true,
      init: async () => undefined,
      buildScene: () => undefined,
      mutate: () => {
        mutations++;
      },
      renderFrame: () => {
        rendered++;
      },
      teardown: () => {
        tornDown = true;
      },
      mutationSignature: () => mutationSignature(selectMutationIndices(1000, 0.1, 0xc0ffee)),
    };
    const canvas = {
      width: 1280,
      height: 720,
      getContext: vi.fn(() => {
        expect(rendered).toBe(7);
        expect(tornDown).toBe(false);
        return { getExtension: () => null, getParameter: () => 'test renderer' };
      }),
    } as unknown as HTMLCanvasElement;
    const result = await runCell(adapter, spec, canvas);

    expect(canvas.getContext).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    expect(result.frameTimeSource).toBe('raf-cadence');
    expect(result.telemetry?.cpuMs).toHaveLength(5);
    expect(result.telemetry?.rafMs).toHaveLength(4);
    expect(result.telemetry?.gpu.frameMs).toEqual([]);
    expect(result.telemetry?.updateMs).toBeNull();
    expect(result.telemetry?.submissionMs).toBeNull();
    expect(result.telemetry?.mutation).toMatchObject({ nominalFraction: 0.1, verified: true });
    expect(result.telemetry?.warmup.completedFrames).toBe(2);
    expect(mutations).toBe(7);
    expect(rendered).toBe(7);
    expect(tornDown).toBe(true);
  });

  test('drains WebGPU warmup submissions before uninstrumented CPU sampling begins', async () => {
    let mutations = 0;
    let drained = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      expect(drained).toBe(true);
      queueMicrotask(() => callback(mutations * 16.7));

      return 1;
    });
    const drain = vi.fn(async () => {
      drained = true;
    });
    const adapter: EngineAdapter = {
      engine: 'fake',
      config: 'current',
      supports: () => true,
      init: async () => undefined,
      buildScene: () => undefined,
      mutate: () => {
        mutations++;
      },
      renderFrame: () => undefined,
      teardown: () => undefined,
      gpuDevice: () => ({ queue: { onSubmittedWorkDone: drain } }) as unknown as GPUDevice,
      mutationSignature: () => mutationSignature(selectMutationIndices(1000, 0.1, 0xc0ffee)),
    };
    const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
    const result = await runCell(adapter, { ...spec, backend: 'webgpu' }, canvas);
    expect(result.status).toBe('ok');
    expect(drain).toHaveBeenCalledTimes(1);
    expect(result.telemetry?.gpu.frameMs).toEqual([]);
  });
});
