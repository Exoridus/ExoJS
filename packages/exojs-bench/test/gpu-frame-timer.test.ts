import type { EngineAdapter } from '../src/rendering/EngineAdapter';
import { createWebGl2GpuTimer, createWebGpuGpuTimer } from '../src/rendering/page/gpuFrameTimer';
import { runCell } from '../src/rendering/page/harness';
import { mutationSignature } from '../src/shared/mutation';

interface FakeQuery {
  ready: boolean;
  deleted: boolean;
  elapsedNs: number;
}

const webGlDevice = () => {
  const queries: FakeQuery[] = [];
  let active: FakeQuery | null = null;
  const state = { disjoint: false, readyOnNextTask: false };
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    getParameter: () => {
      const value = state.disjoint;

      state.disjoint = false;

      return value;
    },
    createQuery: () => {
      const query: FakeQuery = { ready: false, deleted: false, elapsedNs: 2_000_000 };

      queries.push(query);

      return query;
    },
    beginQuery: (_target: number, query: FakeQuery) => {
      active = query;
    },
    endQuery: () => {
      const query = active;

      active = null;

      if (query !== null && state.readyOnNextTask) {
        setTimeout(() => {
          query.ready = true;
        }, 0);
      }
    },
    getQueryParameter: (query: FakeQuery, parameter: number) => (parameter === 1 ? query.ready : query.elapsedNs),
    deleteQuery: (query: FakeQuery) => {
      query.deleted = true;
    },
  } as unknown as WebGL2RenderingContext;

  return { gl, queries, state };
};

interface FakeBuffer {
  readonly data: ArrayBuffer;
  destroyed: boolean;
  mapAsync(): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface FakeCommandBuffer {
  readonly commands: ReadonlyArray<() => void>;
}

const webGpuDevice = (options: { invalidPass?: number; rejectMap?: boolean } = {}) => {
  const values = new BigUint64Array(4096);
  const buffers: FakeBuffer[] = [];
  const querySets: Array<{ destroyed: boolean; destroy(): void }> = [];
  let passIndex = 0;
  const device = {
    features: new Set(['timestamp-query']),
    createQuerySet: () => {
      const querySet = {
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };

      querySets.push(querySet);

      return querySet;
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      const buffer: FakeBuffer = {
        data: new ArrayBuffer(descriptor.size),
        destroyed: false,
        async mapAsync() {
          if (options.rejectMap === true) {
            throw new Error('readback failed');
          }
        },
        getMappedRange(offset = 0, size = descriptor.size) {
          return this.data.slice(offset, offset + size);
        },
        unmap() {},
        destroy() {
          this.destroyed = true;
        },
      };

      buffers.push(buffer);

      return buffer;
    },
    createCommandEncoder: () => {
      const commands: Array<() => void> = [];

      return {
        beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
          const writes = descriptor.timestampWrites;
          const index = passIndex++;

          if (writes !== undefined) {
            commands.push(() => {
              values[writes.beginningOfPassWriteIndex!] = BigInt(index + 1) * 10_000_000n;
              values[writes.endOfPassWriteIndex!] = index === options.invalidPass ? 0n : BigInt(index + 1) * 10_000_000n + 1_000_000n;
            });
          }

          return { draw() {}, end() {} };
        },
        resolveQuerySet: (_set: GPUQuerySet, first: number, count: number, destination: FakeBuffer, offset: number) => {
          commands.push(() => new BigUint64Array(destination.data, offset, count).set(values.subarray(first, first + count)));
        },
        copyBufferToBuffer: (
          source: FakeBuffer,
          sourceOffset: number,
          destination: FakeBuffer,
          destinationOffset: number,
          size: number,
        ) => {
          commands.push(() =>
            new Uint8Array(destination.data, destinationOffset, size).set(new Uint8Array(source.data, sourceOffset, size)),
          );
        },
        finish: (): FakeCommandBuffer => ({ commands }),
      };
    },
    queue: {
      submit: (commands: Iterable<FakeCommandBuffer>) => {
        for (const buffer of commands) {
          for (const command of buffer.commands) {
            command();
          }
        }
      },
      onSubmittedWorkDone: async () => undefined,
    },
  } as unknown as GPUDevice;

  return { device, buffers, querySets };
};

const encodePasses = (device: GPUDevice, count: number): GPUCommandBuffer => {
  const encoder = device.createCommandEncoder();

  for (let pass = 0; pass < count; pass++) {
    encoder.beginRenderPass({ colorAttachments: [] }).end();
  }

  return encoder.finish();
};

afterEach(() => {
  vi.useRealTimers();
});

describe('WebGL frame query collection', () => {
  test('yields to the event loop before collecting a query that resolves on a later task', async () => {
    vi.useFakeTimers();

    const { gl, queries, state } = webGlDevice();

    state.readyOnNextTask = true;

    const timer = createWebGl2GpuTimer(gl);

    timer.beginFrame();
    timer.endFrame();

    const pending = timer.collect();

    await vi.runAllTimersAsync();

    const samples = await pending;

    expect(samples.frameMs).toEqual([2]);
    expect(samples.frameIndices).toEqual([0]);
    expect(samples.timing).toMatchObject({ source: 'webgl2-time-elapsed', status: 'complete', attemptedFrames: 1, validFrames: 1 });
    expect(queries.every(query => query.deleted)).toBe(true);
  });

  test('discards every outstanding query when the disjoint flag is observed', async () => {
    const { gl, queries, state } = webGlDevice();
    const timer = createWebGl2GpuTimer(gl);

    for (let frame = 0; frame < 2; frame++) {
      timer.beginFrame();
      timer.endFrame();
    }

    for (const query of queries) {
      query.ready = true;
    }

    state.disjoint = true;

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 2, validFrames: 0, invalidFrames: 2 });
    expect(queries.every(query => query.deleted)).toBe(true);
  });

  test('bounds unresolved-query polling and releases the queries it could not resolve', async () => {
    vi.useFakeTimers();

    const { gl, queries } = webGlDevice();
    const timer = createWebGl2GpuTimer(gl);

    timer.beginFrame();
    timer.endFrame();

    const pending = timer.collect();

    await vi.runAllTimersAsync();

    const samples = await pending;

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 1, unresolvedFrames: 1, validFrames: 0 });
    expect(queries.every(query => query.deleted)).toBe(true);
  });
});

describe('WebGPU frame timestamp integrity', () => {
  beforeEach(() => {
    vi.stubGlobal('GPUBufferUsage', { QUERY_RESOLVE: 512, COPY_SRC: 4, COPY_DST: 8, MAP_READ: 1 });
    vi.stubGlobal('GPUMapMode', { READ: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('composes deep counters with frame queries without counting collection or retaining wrappers', async () => {
    const { device } = webGpuDevice();
    const originalSubmit = device.queue.submit;
    const originalEncoder = device.createCommandEncoder;
    let timestamp = 0;
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
      mutate: () => undefined,
      teardown: () => undefined,
      mutationSignature: () => mutationSignature([]),
      gpuDevice: () => device,
      renderFrame: () => {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({ colorAttachments: [] });
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      },
    };
    const result = await runCell(
      adapter,
      {
        engine: 'fake',
        config: 'current',
        backend: 'webgpu',
        archetype: 'dirty-0',
        nodeCount: 1,
        warmupFrames: 2,
        timedFrames: 5,
        measurement: { profile: 'deep' },
      },
      { width: 1280, height: 720 } as HTMLCanvasElement,
    );

    expect(result.status).toBe('ok');
    expect(result.telemetry?.api?.queueSubmits).toBe(5);
    expect(result.telemetry?.api?.renderPasses).toBe(5);
    expect(result.telemetry?.structuralTotals?.drawCalls).toBe(5);
    expect(result.telemetry?.updateMs).toHaveLength(5);
    expect(result.telemetry?.submissionMs).toHaveLength(5);
    expect(result.telemetry?.gpu.frameMs).toEqual([1, 1, 1, 1, 1]);
    expect(device.queue.submit).toBe(originalSubmit);
    expect(device.createCommandEncoder).toBe(originalEncoder);
  });

  test('discards the whole frame when one of its pass timestamp pairs is invalid', async () => {
    const { device } = webGpuDevice({ invalidPass: 1 });
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();
    device.queue.submit([encodePasses(device, 2)]);
    timer.endFrame();
    timer.beginFrame();
    device.queue.submit([encodePasses(device, 1)]);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([1]);
    expect(samples.frameIndices).toEqual([1]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 2, validFrames: 1, invalidFrames: 1, status: 'partial' });
  });

  test('does not report a truncated frame when the query capacity is exhausted mid-frame', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);

    for (const count of [2, 2047, 1]) {
      timer.beginFrame();
      device.queue.submit([encodePasses(device, count)]);
      timer.endFrame();
    }

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([2]);
    expect(samples.frameIndices).toEqual([0]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 3, validFrames: 1, skippedFrames: 2, status: 'partial' });
  });

  test('rejects a frame containing a timestamped command buffer that was never submitted', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();
    device.queue.submit([encodePasses(device, 1)]);
    encodePasses(device, 1);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 1, invalidFrames: 1 });
  });

  test('rejects a frame whose timestamped command buffer is submitted more than once', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();

    const buffer = encodePasses(device, 1);

    device.queue.submit([buffer, buffer]);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 1, invalidFrames: 1 });
  });

  test('omits the whole frame when a submitted command buffer bypassed timestamp instrumentation', async () => {
    const { device } = webGpuDevice();
    const uninstrumented = encodePasses(device, 1);
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();
    device.queue.submit([uninstrumented, encodePasses(device, 1)]);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 1, skippedFrames: 1 });
  });

  test('omits a frame that submits a pass encoded in an earlier frame', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();

    const deferred = encodePasses(device, 1);

    timer.endFrame();
    timer.beginFrame();
    device.queue.submit([deferred, encodePasses(device, 1)]);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 2, invalidFrames: 1, skippedFrames: 1 });
  });

  test('omits a frame that submits a render pass encoded during warmup', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);
    const warmupBuffer = encodePasses(device, 1);

    timer.beginFrame();
    device.queue.submit([warmupBuffer, encodePasses(device, 1)]);
    timer.endFrame();

    const samples = await timer.collect();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ attemptedFrames: 1, skippedFrames: 1 });
  });

  test('leaves caller-owned pass descriptors unchanged while injecting timestamps', async () => {
    const { device } = webGpuDevice();
    const timer = createWebGpuGpuTimer(device);
    const descriptor: GPURenderPassDescriptor = Object.freeze({ colorAttachments: [] });

    timer.beginFrame();

    const encoder = device.createCommandEncoder();

    encoder.beginRenderPass(descriptor).end();
    device.queue.submit([encoder.finish()]);
    timer.endFrame();

    expect((await timer.collect()).frameMs).toEqual([1]);
    expect(descriptor).not.toHaveProperty('timestampWrites');
  });

  test('preserves the CPU measurement when timestamp readback fails and restores owned resources', async () => {
    const { device, buffers, querySets } = webGpuDevice({ rejectMap: true });
    const originalEncoder = device.createCommandEncoder;
    const originalSubmit = device.queue.submit;
    const timer = createWebGpuGpuTimer(device);

    timer.beginFrame();
    device.queue.submit([encodePasses(device, 1)]);
    timer.endFrame();

    const samples = await timer.collect();

    timer.dispose?.();
    timer.dispose?.();

    expect(samples.frameMs).toEqual([]);
    expect(samples.timing).toMatchObject({ source: 'webgpu-render-pass-timestamps', status: 'failed', validFrames: 0 });
    expect(samples.queueMs).toHaveLength(1);
    expect(device.createCommandEncoder).toBe(originalEncoder);
    expect(device.queue.submit).toBe(originalSubmit);
    expect(buffers.every(buffer => buffer.destroyed)).toBe(true);
    expect(querySets.every(querySet => querySet.destroyed)).toBe(true);
  });
});
