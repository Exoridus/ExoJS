import { WebGpuInstanceArena } from '#rendering/webgpu/WebGpuInstanceArena';
import type { WebGpuActiveRenderPass } from '#rendering/webgpu/WebGpuPassCoordinator';

// Minimal WebGPU device mock sufficient for arena buffer creation/destruction.
// Each created buffer records the size it was allocated with so tests can assert
// the doubling-capacity invariant through observable behaviour.
interface MockBuffer {
  readonly id: number;
  readonly size: number;
  destroy: MockInstance;
}

interface MockDevice {
  readonly createBuffer: MockInstance;
  readonly buffers: MockBuffer[];
}

let bufferIdCounter = 0;

const createMockDevice = (): MockDevice => {
  const buffers: MockBuffer[] = [];

  return {
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const buf: MockBuffer = {
        id: ++bufferIdCounter,
        size: descriptor.size,
        destroy: vi.fn(),
      };

      buffers.push(buf);

      return buf as unknown as GPUBuffer;
    }),
    buffers,
  };
};

// grow() reads GPUBufferUsage.VERTEX | COPY_DST; provide a stub for Node.
const setupGpuBufferUsage = (): (() => void) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: { VERTEX: 32, COPY_DST: 8 },
  });

  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'GPUBufferUsage', previous);
    } else {
      Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: undefined });
    }
  };
};

// A distinct pass identity — the arena only compares object references.
const makePass = (): WebGpuActiveRenderPass => ({}) as unknown as WebGpuActiveRenderPass;

describe('WebGpuInstanceArena', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = setupGpuBufferUsage();
    bufferIdCounter = 0;
  });

  afterEach(() => {
    restore();
  });

  test('has no buffer and does not fit anything before the first grow', () => {
    const arena = new WebGpuInstanceArena('test', 64);

    expect(arena.buffer).toBeNull();
    expect(arena.cursor).toBe(0);
    // fits() must be false while the buffer is null, forcing the caller to grow.
    expect(arena.fits(1)).toBe(false);
  });

  test('take() hands out distinct, monotonically increasing offsets within a pass', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 256);
    const pass = makePass();

    arena.grow(device as unknown as GPUDevice, 256);
    arena.syncPass(pass);

    const a = arena.take(20);
    const b = arena.take(36);
    const c = arena.take(8);

    // Distinct and monotonic: each offset equals the sum of prior batch bytes.
    expect(a).toBe(0);
    expect(b).toBe(20);
    expect(c).toBe(56);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(arena.cursor).toBe(64);
  });

  test('fits() is true up to capacity and false once a batch would overflow', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 64);
    const pass = makePass();

    arena.grow(device as unknown as GPUDevice, 64);
    arena.syncPass(pass);

    expect(arena.fits(64)).toBe(true);
    expect(arena.fits(65)).toBe(false);

    arena.take(40);

    // 24 bytes remain: exactly-fits is true, one more byte overflows.
    expect(arena.fits(24)).toBe(true);
    expect(arena.fits(25)).toBe(false);
  });

  test('grow() doubles capacity (or jumps to the request) and destroys the old buffer', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 16);

    arena.grow(device as unknown as GPUDevice, 10);

    // First grow: max(0*2, 10, 16) = 16.
    expect(device.buffers[0]!.size).toBe(16);
    expect(arena.fits(16)).toBe(true);
    expect(arena.fits(17)).toBe(false);

    arena.grow(device as unknown as GPUDevice, 20);

    // Doubling 16 -> 32 covers the 20-byte request; the old buffer is freed.
    expect(device.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(device.buffers[1]!.size).toBe(32);
    expect(arena.fits(32)).toBe(true);
    expect(arena.fits(33)).toBe(false);

    arena.grow(device as unknown as GPUDevice, 200);

    // Doubling 32 -> 64 is insufficient, so it jumps straight to the request.
    expect(device.buffers[2]!.size).toBe(200);
    expect(arena.buffer).toBe(device.buffers[2] as unknown as GPUBuffer);
  });

  test('grow() preserves the append invariant: a fresh larger buffer, cursor untouched', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 32);
    const pass = makePass();

    arena.grow(device as unknown as GPUDevice, 32);
    arena.syncPass(pass);
    arena.take(32);

    expect(arena.cursor).toBe(32);
    // Real callers reset the pass before growing mid-frame; grow itself leaves
    // the cursor alone, so the buffer swap does not lose the append position.
    arena.grow(device as unknown as GPUDevice, 40);
    expect(arena.cursor).toBe(32);
    expect(arena.buffer).toBe(device.buffers[1] as unknown as GPUBuffer);
  });

  test('syncPass() resets the cursor when a different pass opens (per-frame reset)', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 256);
    const passA = makePass();
    const passB = makePass();

    arena.grow(device as unknown as GPUDevice, 256);

    arena.syncPass(passA);
    arena.take(48);
    expect(arena.cursor).toBe(48);
    expect(arena.tracksPass(passA)).toBe(true);

    // Same pass again: the cursor keeps accumulating (batches merge).
    arena.syncPass(passA);
    expect(arena.cursor).toBe(48);

    // A new pass (new frame / post-boundary reopen): cursor restarts at 0.
    arena.syncPass(passB);
    expect(arena.cursor).toBe(0);
    expect(arena.tracksPass(passA)).toBe(false);
    expect(arena.tracksPass(passB)).toBe(true);
  });

  test('resetPass() drops the pass association so the next syncPass restarts', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 128);
    const pass = makePass();

    arena.grow(device as unknown as GPUDevice, 128);
    arena.syncPass(pass);
    arena.take(64);
    expect(arena.cursor).toBe(64);

    arena.resetPass();

    expect(arena.cursor).toBe(0);
    expect(arena.tracksPass(pass)).toBe(false);

    // Re-syncing the same pass object now restarts a fresh append run.
    arena.syncPass(pass);
    expect(arena.cursor).toBe(0);
    expect(arena.tracksPass(pass)).toBe(true);
  });

  test('destroy() releases the buffer and clears state', () => {
    const device = createMockDevice();
    const arena = new WebGpuInstanceArena('test', 64);
    const pass = makePass();

    arena.grow(device as unknown as GPUDevice, 64);
    arena.syncPass(pass);
    arena.take(32);

    arena.destroy();

    expect(device.buffers[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(arena.buffer).toBeNull();
    expect(arena.cursor).toBe(0);
    expect(arena.tracksPass(pass)).toBe(false);
  });
});
