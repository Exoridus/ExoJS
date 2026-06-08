import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { WebGpuTransformStorage } from '#rendering/webgpu/WebGpuTransformStorage';

// Minimal WebGPU device mock sufficient for storage-buffer creation/destruction.
interface MockBuffer {
  readonly id: number;
  destroy: MockInstance;
}

interface MockDevice {
  readonly createBuffer: MockInstance;
  readonly buffers: MockBuffer[];
  queue: {
    writeBuffer: MockInstance;
  };
}

let bufferIdCounter = 0;

const createMockDevice = (): MockDevice => {
  const buffers: MockBuffer[] = [];

  return {
    createBuffer: vi.fn(() => {
      const buf: MockBuffer = {
        id: ++bufferIdCounter,
        destroy: vi.fn(),
      };

      buffers.push(buf);

      return buf as unknown as GPUBuffer;
    }),
    buffers,
    queue: {
      writeBuffer: vi.fn(),
    },
  };
};

// Restore GPUBufferUsage after tests that define it.
const setupGpuBufferUsage = (): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: { STORAGE: 128, COPY_DST: 8 },
  });

  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'GPUBufferUsage', previous);
    } else {
      Object.defineProperty(globalThis, 'GPUBufferUsage', {
        configurable: true,
        value: undefined,
      });
    }
  };
};

const material = (): MaterialKey => ({
  rendererId: 1,
  blendMode: 0,
  textureId: -1,
  shaderId: -1,
  pipelineKey: 1,
  bindKey: 1,
});

class TestDrawable extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 8, 8);
  }
}

const makeCommand = (nodeIndex: number): DrawCommand => ({
  kind: RenderEntryKind.Draw,
  drawable: new TestDrawable(),
  nodeIndex,
  seq: nodeIndex,
  zIndex: 0,
  material: material(),
  groupIndex: 1,
  minX: 0,
  minY: 0,
  maxX: 8,
  maxY: 8,
});

describe('WebGpuTransformStorage.reserve', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupGpuBufferUsage();
    bufferIdCounter = 0;
  });

  afterEach(() => {
    restore();
  });

  test('reserve allocates a GPU buffer on a fresh storage', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(device.buffers.length).toBe(1);
  });

  test('reserve with sufficient capacity is a no-op (same buffer, no extra allocations)', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(8);
    storage.reserve(device as unknown as GPUDevice, 8);

    const firstBuffer = device.buffers[0];

    expect(device.createBuffer).toHaveBeenCalledTimes(1);

    // A second reserve with ≤ the original count must not create a new buffer.
    storage.reserve(device as unknown as GPUDevice, 4);
    storage.reserve(device as unknown as GPUDevice, 8);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(firstBuffer.destroy).not.toHaveBeenCalled();
  });

  test('getBuffer with count ≤ reserve count reuses the pre-allocated buffer', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(16);
    storage.reserve(device as unknown as GPUDevice, 16);

    const reservedBuffer = device.buffers[0];

    // Write a command so getBuffer has data to upload.
    storage.writeCommand(makeCommand(0));

    const result = storage.getBuffer(device as unknown as GPUDevice, 4);

    // No additional buffer should have been created.
    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(result.buffer).toBe(reservedBuffer);
  });

  test('getBuffer with count larger than reserve still grows correctly', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);

    const firstBuffer = device.buffers[0];

    // Request a much larger buffer than reserved.
    storage.writeCommand(makeCommand(0));
    storage.getBuffer(device as unknown as GPUDevice, 64);

    expect(device.createBuffer).toHaveBeenCalledTimes(2);
    expect(firstBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(device.buffers.length).toBe(2);
  });

  test('reserve with recordCount = 0 still allocates at least one slot', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(0);
    storage.reserve(device as unknown as GPUDevice, 0);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);
  });

  test('write/skip/upload counters are unaffected by reserve', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);
    storage.writeCommand(makeCommand(0));
    storage.writeCommand(makeCommand(1));
    storage.recordSkippedWrite();

    expect(storage.buffer.writeCount).toBe(2);
    expect(storage.buffer.skippedWriteCount).toBe(1);
    expect(storage.buffer.uploadCount).toBe(0);
  });

  test('upload counters increment correctly after getBuffer following reserve', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);
    storage.writeCommand(makeCommand(0));
    storage.writeCommand(makeCommand(2));

    storage.getBuffer(device as unknown as GPUDevice, 3);

    expect(storage.buffer.uploadCount).toBe(1);
    expect(storage.buffer.uploadedRecordCount).toBe(3);
  });

  test('reserve after begin does not reset write counters', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.writeCommand(makeCommand(0));

    expect(storage.buffer.writeCount).toBe(1);

    storage.reserve(device as unknown as GPUDevice, 4);

    // Reserve must not call begin() or reset stats.
    expect(storage.buffer.writeCount).toBe(1);
  });

  test('destroy cleans up a pre-reserved buffer', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);

    const buf = device.buffers[0];

    storage.destroy();

    expect(buf.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('WebGpuTransformStorage.reserve: no reallocation across multiple getBuffer calls', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupGpuBufferUsage();
    bufferIdCounter = 0;
  });

  afterEach(() => {
    restore();
  });

  test('simulated multi-group plan: reserve once, multiple getBuffer calls share the same buffer', () => {
    // Simulates a render plan with two sprite groups of different blend modes.
    // Group A has nodes 0-2, Group B has nodes 3-5. Without pre-reservation the
    // second flush (nodeIndex 5+1=6) would reallocate if the first flush only
    // sized the buffer for 3 slots. With reserve(6) the buffer is large enough
    // from the start.
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();
    const planNodeCount = 6;

    storage.begin(planNodeCount);
    storage.reserve(device as unknown as GPUDevice, planNodeCount);

    const reservedBuffer = device.buffers[0];

    // Group A: nodes 0-2 written before flush.
    storage.writeCommand(makeCommand(0));
    storage.writeCommand(makeCommand(1));
    storage.writeCommand(makeCommand(2));

    const flush1 = storage.getBuffer(device as unknown as GPUDevice, 3);

    expect(flush1.buffer).toBe(reservedBuffer);
    expect(device.createBuffer).toHaveBeenCalledTimes(1);

    // Group B: nodes 3-5 written before second flush.
    storage.writeCommand(makeCommand(3));
    storage.writeCommand(makeCommand(4));
    storage.writeCommand(makeCommand(5));

    const flush2 = storage.getBuffer(device as unknown as GPUDevice, 6);

    expect(flush2.buffer).toBe(reservedBuffer);
    // Still only the one buffer from reserve — no mid-frame reallocation.
    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(reservedBuffer.destroy).not.toHaveBeenCalled();
  });

  test('without reserve, second getBuffer with larger count triggers reallocation', () => {
    // This documents the pre-fix behaviour: without reserve(), a second flush
    // that needs more capacity destroys and replaces the buffer.
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    storage.begin(6);

    // First flush sizes for 3 slots.
    storage.writeCommand(makeCommand(0));
    storage.getBuffer(device as unknown as GPUDevice, 3);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);

    const firstBuffer = device.buffers[0];

    // Second flush needs 6 slots — old buffer is too small, reallocation happens.
    storage.writeCommand(makeCommand(5));
    storage.getBuffer(device as unknown as GPUDevice, 6);

    expect(device.createBuffer).toHaveBeenCalledTimes(2);
    expect(firstBuffer.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('WebGpuTransformStorage.reserve: Color/tint correctness after multi-flush', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupGpuBufferUsage();
  });

  afterEach(() => {
    restore();
  });

  test('data written across two groups is intact after both flushes complete', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();
    const floatsPerSlot = 12;

    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);

    const cmd0 = makeCommand(0);

    (cmd0.drawable as Drawable).setPosition(10, 20);
    storage.writeCommand(cmd0);

    const cmd3 = makeCommand(3);

    (cmd3.drawable as Drawable).setPosition(70, 80);
    storage.writeCommand(cmd3);

    storage.getBuffer(device as unknown as GPUDevice, 4);

    // Node 0: tx=10, ty=20
    expect(storage.buffer.data[floatsPerSlot * 0 + 4]).toBe(10);
    expect(storage.buffer.data[floatsPerSlot * 0 + 5]).toBe(20);

    // Node 3: tx=70, ty=80
    expect(storage.buffer.data[floatsPerSlot * 3 + 4]).toBe(70);
    expect(storage.buffer.data[floatsPerSlot * 3 + 5]).toBe(80);
  });
});

// Regression guard: ensure begin() still resets counters even when a reserved
// buffer is already present (buffer must NOT be re-created on begin).
describe('WebGpuTransformStorage.reserve: begin across frames', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupGpuBufferUsage();
  });

  afterEach(() => {
    restore();
  });

  test('begin on frame N+1 resets counters but keeps the reserved GPU buffer', () => {
    const device = createMockDevice();
    const storage = new WebGpuTransformStorage();

    // Frame 1.
    storage.begin(4);
    storage.reserve(device as unknown as GPUDevice, 4);
    storage.writeCommand(makeCommand(0));
    storage.getBuffer(device as unknown as GPUDevice, 1);

    expect(storage.buffer.uploadCount).toBe(1);
    expect(device.createBuffer).toHaveBeenCalledTimes(1);

    const buf = device.buffers[0];

    // Frame 2: same capacity.
    storage.begin(4);

    expect(storage.buffer.writeCount).toBe(0);
    expect(storage.buffer.uploadCount).toBe(0);

    // Reserve again — buffer is already large enough; no new allocation.
    storage.reserve(device as unknown as GPUDevice, 4);

    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(buf.destroy).not.toHaveBeenCalled();
  });
});
