/** Sequential backends acquire distinct adapters and devices from one `GPU` object. */

import { Color } from '#core/Color';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

interface MockGpuEnvironment {
  readonly gpu: GPU;
  readonly requestAdapter: ReturnType<typeof vi.fn>;
  /** Causes the next `requestDevice()` call to reject once. */
  failNextDeviceRequest(): void;
}

/** A fresh, independent mock `GPU` object: each adapter request gets a distinct adapter. */
const createMockGpu = (): MockGpuEnvironment => {
  let failNext = false;

  const createDevice = (): GPUDevice =>
    ({
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
    }) as unknown as GPUDevice;

  const requestAdapter = vi.fn(async () => {
    const device = createDevice();
    const requestDevice = vi.fn(async () => {
      if (failNext) {
        failNext = false;

        throw new DOMException('Not enough memory left.', 'OperationError');
      }

      return device;
    });

    return { requestDevice, features: { has: () => false } } as unknown as GPUAdapter;
  });

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

describe('WebGpuBackend adapter acquisition', () => {
  it('requests a fresh adapter for each sequential backend on the same GPU object', async () => {
    const environment = createMockGpu();

    await withGpu(environment.gpu, async () => {
      const first = makeBackend(makeCanvas());

      await first.initialize();
      first.destroy();

      const second = makeBackend(makeCanvas());

      await second.initialize();
      second.destroy();

      expect(environment.requestAdapter).toHaveBeenCalledTimes(2);
    });
  });

  it('requests an adapter from each GPU object', async () => {
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

  it('requests a fresh adapter when requestDevice rejects, then initializes', async () => {
    const environment = createMockGpu();

    await withGpu(environment.gpu, async () => {
      const first = makeBackend(makeCanvas());

      await first.initialize();
      first.destroy();

      // The next adapter's requestDevice() call rejects, simulating a transient
      // device-acquisition failure.
      environment.failNextDeviceRequest();

      const second = makeBackend(makeCanvas());

      await expect(second.initialize()).resolves.toBe(second);
      second.destroy();

      // A fresh adapter is requested for the retry.
      expect(environment.requestAdapter).toHaveBeenCalledTimes(3);
    });
  });
});
