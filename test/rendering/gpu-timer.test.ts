/**
 * GPU frame-timer tests for both backends.
 *
 * The timers talk to a handful of GL / WebGPU entry points and nothing else, so
 * they are driven here against local fakes rather than a full backend: what
 * needs pinning down is the arithmetic and the drop rules (a disjoint GL clock,
 * an exhausted WebGPU query set, an unavailable timestamp pair), none of which a
 * real device can be asked to produce on demand.
 */

import { createWebGl2GpuTimer } from '#rendering/webgl2/WebGl2GpuTimer';
import { WebGpuGpuTimer } from '#rendering/webgpu/WebGpuGpuTimer';

// ---------------------------------------------------------------------------
// WebGL2
// ---------------------------------------------------------------------------

const queryResultAvailable = 0x9194;
const queryResult = 0x8866;
const timeElapsed = 0x88bf;
const gpuDisjoint = 0x8fbb;

interface FakeQuery {
  available: boolean;
  elapsedNs: number;
}

const makeGl = ({ extension = true }: { extension?: boolean } = {}) => {
  const state = { disjoint: false, deleted: 0, open: null as FakeQuery | null };

  const gl = {
    QUERY_RESULT_AVAILABLE: queryResultAvailable,
    QUERY_RESULT: queryResult,
    getExtension: (name: string) =>
      extension && name === 'EXT_disjoint_timer_query_webgl2' ? { TIME_ELAPSED_EXT: timeElapsed, GPU_DISJOINT_EXT: gpuDisjoint } : null,
    createQuery: (): FakeQuery => ({ available: false, elapsedNs: 0 }),
    beginQuery: (_target: number, query: FakeQuery) => {
      state.open = query;
    },
    endQuery: () => {
      state.open = null;
    },
    getQueryParameter: (query: FakeQuery, parameter: number) => (parameter === queryResultAvailable ? query.available : query.elapsedNs),
    getParameter: (parameter: number) => (parameter === gpuDisjoint ? state.disjoint : 0),
    deleteQuery: () => {
      state.deleted++;
    },
  };

  return {
    gl: gl as unknown as WebGL2RenderingContext,
    state,
    resolve: (query: FakeQuery, ms: number) => Object.assign(query, { available: true, elapsedNs: ms * 1e6 }),
  };
};

describe('createWebGl2GpuTimer', () => {
  test('returns null when the context does not expose the timer extension', () => {
    expect(createWebGl2GpuTimer(makeGl({ extension: false }).gl)).toBeNull();
  });

  test('publishes a frame time only once the query has resolved', () => {
    const { gl, resolve } = makeGl();
    const timer = createWebGl2GpuTimer(gl)!;
    const queries: FakeQuery[] = [];

    // Capture the query the timer opens so the test can resolve it later.
    const createQuery = gl.createQuery.bind(gl);

    gl.createQuery = () => {
      const query = createQuery() as unknown as FakeQuery;

      queries.push(query);

      return query as unknown as WebGLQuery;
    };

    timer.beginFrame();
    timer.endFrame();

    expect(timer.lastFrameMs).toBeNull();

    resolve(queries[0]!, 4.25);
    timer.beginFrame();
    timer.endFrame();

    expect(timer.lastFrameMs).toBeCloseTo(4.25, 6);
  });

  test('drops a sample taken across a disjoint GPU clock instead of publishing noise', () => {
    const { gl, state, resolve } = makeGl();
    const timer = createWebGl2GpuTimer(gl)!;
    const queries: FakeQuery[] = [];
    const createQuery = gl.createQuery.bind(gl);

    gl.createQuery = () => {
      const query = createQuery() as unknown as FakeQuery;

      queries.push(query);

      return query as unknown as WebGLQuery;
    };

    timer.beginFrame();
    timer.endFrame();
    resolve(queries[0]!, 999);
    state.disjoint = true;

    timer.beginFrame();
    timer.endFrame();

    expect(timer.lastFrameMs).toBeNull();
  });

  test('a throwing GL call disables the timer instead of escaping into the frame', () => {
    const { gl } = makeGl();
    const timer = createWebGl2GpuTimer(gl)!;

    gl.beginQuery = () => {
      throw new Error('context lost');
    };

    expect(() => timer.beginFrame()).not.toThrow();
    expect(() => timer.endFrame()).not.toThrow();
    expect(timer.lastFrameMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WebGPU
// ---------------------------------------------------------------------------

const bytesPerQuery = 8;

/**
 * Device fake whose readback buffer hands back timestamps the test supplies.
 * `mapAsync` resolves immediately, so a frame's result is observable on the
 * microtask right after `endFrame`.
 */
const makeDevice = ({ feature = true }: { feature?: boolean } = {}) => {
  const timestamps: bigint[] = [];
  const submitted: unknown[] = [];

  const makeBuffer = (): GPUBuffer =>
    ({
      mapAsync: () => Promise.resolve(),
      getMappedRange: (offset: number, size: number) => {
        const view = new BigUint64Array(size / bytesPerQuery);

        for (let index = 0; index < view.length; index++) {
          view[index] = timestamps[offset / bytesPerQuery + index] ?? 0n;
        }

        return view.buffer;
      },
      unmap: () => undefined,
      destroy: () => undefined,
    }) as unknown as GPUBuffer;

  const device = {
    features: { has: (name: string) => feature && name === 'timestamp-query' },
    createQuerySet: () => ({ destroy: () => undefined }),
    createBuffer: makeBuffer,
    createCommandEncoder: () => ({
      resolveQuerySet: () => undefined,
      copyBufferToBuffer: () => undefined,
      finish: () => ({}),
    }),
    queue: {
      submit: (buffers: unknown[]) => {
        submitted.push(...buffers);
      },
    },
  };

  return { device: device as unknown as GPUDevice, timestamps, submitted };
};

describe('WebGpuGpuTimer', () => {
  // The timer builds its buffer descriptors from these WebGPU globals, which
  // Node does not provide.
  const webgpuGlobals: Record<string, unknown> = {
    GPUBufferUsage: { QUERY_RESOLVE: 512, COPY_SRC: 4, COPY_DST: 8, MAP_READ: 1 },
    GPUMapMode: { READ: 1 },
  };
  const restore: Array<() => void> = [];

  beforeEach(() => {
    for (const [name, value] of Object.entries(webgpuGlobals)) {
      const previous = Object.getOwnPropertyDescriptor(globalThis, name);

      Object.defineProperty(globalThis, name, { configurable: true, value });
      restore.push(() =>
        previous ? Object.defineProperty(globalThis, name, previous) : Object.defineProperty(globalThis, name, { configurable: true, value: undefined }),
      );
    }
  });

  afterEach(() => {
    for (const undo of restore.splice(0)) undo();
  });

  test('returns null when the device carries no timestamp-query feature', () => {
    expect(WebGpuGpuTimer.create(makeDevice({ feature: false }).device)).toBeNull();
  });

  test('hands out timestamp writes only for passes opened inside a timed frame', () => {
    const timer = WebGpuGpuTimer.create(makeDevice().device)!;

    expect(timer.acquirePassWrites()).toBeUndefined();

    timer.beginFrame();

    const first = timer.acquirePassWrites();
    const second = timer.acquirePassWrites();

    expect(first).toEqual({ querySet: expect.anything(), beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 });
    expect(second).toEqual({ querySet: expect.anything(), beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 });

    timer.endFrame();

    expect(timer.acquirePassWrites()).toBeUndefined();
  });

  test("a frame's GPU time is the sum of its passes' intervals", async () => {
    const { device, timestamps } = makeDevice();
    const timer = WebGpuGpuTimer.create(device)!;

    timer.beginFrame();
    timer.acquirePassWrites();
    timer.acquirePassWrites();
    // 1.5ms and 0.5ms, in nanoseconds.
    timestamps.push(1_000n, 1_500_000n, 2_000_000n, 2_500_000n);
    timer.endFrame();

    await vi.waitFor(() => expect(timer.lastFrameMs).not.toBeNull());
    expect(timer.lastFrameMs).toBeCloseTo(1.999, 3);
  });

  test('an unavailable or non-increasing pair is dropped rather than folded in', async () => {
    const { device, timestamps } = makeDevice();
    const timer = WebGpuGpuTimer.create(device)!;

    timer.beginFrame();
    timer.acquirePassWrites();
    timer.acquirePassWrites();
    timer.acquirePassWrites();
    // An unavailable pair (zero), a reversed pair, then one real 2ms interval.
    timestamps.push(0n, 5_000_000n, 9_000_000n, 8_000_000n, 1_000_000n, 3_000_000n);
    timer.endFrame();

    await vi.waitFor(() => expect(timer.lastFrameMs).not.toBeNull());
    expect(timer.lastFrameMs).toBeCloseTo(2, 6);
  });

  test('a frame with no passes publishes nothing', async () => {
    const { device, submitted } = makeDevice();
    const timer = WebGpuGpuTimer.create(device)!;

    timer.beginFrame();
    timer.endFrame();

    await Promise.resolve();

    expect(submitted).toHaveLength(0);
    expect(timer.lastFrameMs).toBeNull();
  });

  test('a frame that exhausts the query set publishes nothing rather than a truncated sum', async () => {
    const { device, timestamps, submitted } = makeDevice();
    const timer = WebGpuGpuTimer.create(device)!;

    timer.beginFrame();

    // Capacity is 1024 slots, i.e. 512 passes; one more must not be timed.
    for (let pass = 0; pass < 512; pass++) {
      expect(timer.acquirePassWrites()).not.toBeUndefined();
      timestamps.push(BigInt(pass * 2 + 1) * 1_000_000n, BigInt(pass * 2 + 2) * 1_000_000n);
    }

    expect(timer.acquirePassWrites()).toBeUndefined();

    timer.endFrame();

    await Promise.resolve();

    expect(submitted).toHaveLength(0);
    expect(timer.lastFrameMs).toBeNull();
  });

  test('destroy() stops timing and clears the published value', () => {
    const timer = WebGpuGpuTimer.create(makeDevice().device)!;

    timer.beginFrame();
    timer.acquirePassWrites();
    timer.destroy();

    expect(timer.lastFrameMs).toBeNull();
    timer.beginFrame();
    expect(timer.acquirePassWrites()).toBeUndefined();

    // Double-destroy must stay safe.
    expect(() => timer.destroy()).not.toThrow();
  });
});
