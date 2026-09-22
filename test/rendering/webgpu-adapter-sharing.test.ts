/**
 * Adapter reuse across `WebGpuBackend` instances.
 *
 * `GPUDevice` has an explicit `destroy()`; `GPUAdapter` does not, so an
 * adapter is released only once garbage collection gets to it. A process that
 * constructs many backends in quick succession - the rendering parity matrix
 * does, once per scene per property - can outrun that collection and hit a
 * driver's live-adapter ceiling well before anything has actually leaked
 * (observed on Firefox as `requestDevice()` rejecting with "not enough memory
 * left"). `WebGpuBackend` shares one adapter per `GPU` object instead of
 * requesting a fresh one per instance; these are the guarantees that fix
 * rests on.
 */

import { Color } from '#core/Color';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

interface MockGpuEnvironment {
  readonly gpu: GPU;
  readonly requestAdapter: ReturnType<typeof vi.fn>;
  /** The next `requestDevice()` call on this GPU's adapter rejects, as a stale/dead adapter would. */
  failNextDeviceRequest(): void;
}

/** A fresh, independent mock `GPU` object: its own `requestAdapter` spy, its own device chain. */
const createMockGpu = (): MockGpuEnvironment => {
  let failNext = false;

  const device = {
    createShaderModule: vi.fn(() => ({}) as GPUShaderModule),
    createBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
    createPipelineLayout: vi.fn(() => ({}) as GPUPipelineLayout),
    createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    createRenderPipeline: vi.fn(() => ({}) as GPURenderPipeline),
    createCommandEncoder: vi.fn(),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() }) as unknown as GPUBuffer),
    createTexture: vi.fn(() => ({ destroy: vi.fn(), createView: vi.fn(() => ({})) }) as unknown as GPUTexture),
    createSampler: vi.fn(() => ({}) as GPUSampler),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // Never resolves within a test's lifetime: nothing here drives real device loss.
    lost: new Promise<GPUDeviceLostInfo>(() => undefined),
    destroy: vi.fn(),
    queue: { writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;

  const requestDevice = vi.fn(async () => {
    if (failNext) {
      failNext = false;

      throw new DOMException('Not enough memory left.', 'OperationError');
    }

    return device;
  });

  const requestAdapter = vi.fn(async () => ({ requestDevice, features: { has: () => false } }) as unknown as GPUAdapter);

  const gpu = { requestAdapter, getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm' as GPUTextureFormat) } as unknown as GPU;

  return {
    gpu,
    requestAdapter,
    failNextDeviceRequest: (): void => {
      failNext = true;
    },
  };
};

/** Installs `gpu` as `navigator.gpu`, plus the globals every backend init reads, for the duration of `run`. */
const withGpu = async (gpu: GPU, run: () => Promise<void>): Promise<void> => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousTextureUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage');

  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
  Object.defineProperty(globalThis, 'GPUTextureUsage', {
    configurable: true,
    value: { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 },
  });

  try {
    await run();
  } finally {
    if (previousGpu) Object.defineProperty(navigator, 'gpu', previousGpu);
    else Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });

    if (previousTextureUsage) Object.defineProperty(globalThis, 'GPUTextureUsage', previousTextureUsage);
    else Object.defineProperty(globalThis, 'GPUTextureUsage', { configurable: true, value: undefined });
  }
};

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) }) as unknown as GPUTexture),
  } as unknown as GPUCanvasContext;

  Object.defineProperty(canvas, 'getContext', { configurable: true, value: (type: string) => (type === 'webgpu' ? context : null) });

  return canvas;
};

const makeBackend = (canvas: HTMLCanvasElement): WebGpuBackend =>
  new WebGpuBackend({ canvas, options: { canvas: { width: 4, height: 4 }, clearColor: Color.black } } as never);

describe('WebGpuBackend adapter sharing', () => {
  it('requests the adapter once and reuses it across sequential backends on the same GPU object', async () => {
    const environment = createMockGpu();

    await withGpu(environment.gpu, async () => {
      const first = makeBackend(makeCanvas());

      await first.initialize();
      first.destroy();

      const second = makeBackend(makeCanvas());

      await second.initialize();
      second.destroy();

      expect(environment.requestAdapter).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps each GPU object on its own adapter', async () => {
    const environmentA = createMockGpu();
    const environmentB = createMockGpu();

    await withGpu(environmentA.gpu, async () => {
      const backend = makeBackend(makeCanvas());

      await backend.initialize();
      backend.destroy();
    });

    await withGpu(environmentB.gpu, async () => {
      const backend = makeBackend(makeCanvas());

      await backend.initialize();
      backend.destroy();
    });

    expect(environmentA.requestAdapter).toHaveBeenCalledTimes(1);
    expect(environmentB.requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('re-requests the adapter once when requestDevice rejects on the cached one, and still initializes', async () => {
    const environment = createMockGpu();

    await withGpu(environment.gpu, async () => {
      const first = makeBackend(makeCanvas());

      await first.initialize();
      first.destroy();

      // The cached adapter is now stale, as a driver-reset one would be: the
      // next requestDevice() call on it rejects.
      environment.failNextDeviceRequest();

      const second = makeBackend(makeCanvas());

      await expect(second.initialize()).resolves.toBe(second);
      second.destroy();

      // One request for the stale adapter's rejection to surface, one retry
      // that succeeded - not a silent swallow, and not a loop.
      expect(environment.requestAdapter).toHaveBeenCalledTimes(2);
    });
  });
});
