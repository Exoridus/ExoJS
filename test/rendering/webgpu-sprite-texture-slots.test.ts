/**
 * WebGPU sprite batcher texture-slot capacity (issue #274, F9b follow-up).
 *
 * The WebGPU sprite renderer used to hard-code an 8-texture bind-group layout,
 * so scenes with more than 8 unique textures split into one flush per 8
 * sprites — while the WebGL2 batcher had already been lifted to 16 slots (F9).
 *
 * WGSL `binding_array` is not core WebGPU, so the lift is capability-gated on
 * DEVICE LIMITS instead: the WGSL source and bind-group layout are generated
 * for a slot count derived from `min(maxSampledTexturesPerShaderStage,
 * maxSamplersPerShaderStage)`, quantized to the 8 / 16 / 32 tiers (the spec's
 * base limits guarantee 16; the backend requests up to 32 at device creation
 * when the adapter offers more). A device that exposes no limits object
 * (non-conformant mocks) falls back to the legacy 8-slot path.
 *
 * These tests drive the REAL WebGpuBackend + sprite renderer against a mock
 * device with controlled limits and count `drawIndexed` calls per frame.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { resolveSpriteBatchTextureSlots } from '#rendering/webgpu/WebGpuSpriteRenderer';

interface MockLimits {
  readonly maxSampledTexturesPerShaderStage: number;
  readonly maxSamplersPerShaderStage: number;
}

interface MockWebGpuEnvironment {
  readonly canvas: HTMLCanvasElement;
  drawIndexedCount(): number;
  /** Descriptors passed to adapter.requestDevice, in call order. */
  requestDeviceDescriptors(): ReadonlyArray<GPUDeviceDescriptor | undefined>;
  /** Texture-typed entry count of every created bind group layout, by label. */
  textureLayoutEntryCounts(): ReadonlyMap<string, number>;
  restore(): void;
}

const globalStubs: ReadonlyArray<readonly [string, unknown]> = [
  ['GPUBufferUsage', { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8, STORAGE: 16, COPY_SRC: 32 }],
  ['GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 }],
  ['GPUColorWrite', { ALL: 0xf }],
  ['GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 }],
];

interface MockEnvironmentOptions {
  /** Limits the mock ADAPTER advertises (drives requiredLimits negotiation). */
  readonly adapterLimits?: MockLimits;
  /** Limits the mock DEVICE reports as granted. Omit for a limit-less device. */
  readonly deviceLimits?: MockLimits;
}

const createMockWebGpuEnvironment = (options: MockEnvironmentOptions = {}): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  let drawIndexedCount = 0;
  const requestDeviceDescriptors: Array<GPUDeviceDescriptor | undefined> = [];
  const textureLayoutEntryCounts = new Map<string, number>();

  const pass = {
    setPipeline: (): void => {},
    setBindGroup: (): void => {},
    setVertexBuffer: (): void => {},
    setIndexBuffer: (): void => {},
    setScissorRect: (): void => {},
    pushDebugGroup: (): void => {},
    popDebugGroup: (): void => {},
    draw: (): void => {},
    drawIndexed: (): void => {
      drawIndexedCount++;
    },
    end: (): void => {},
  };
  const encoder = {
    beginRenderPass: () => pass,
    finish: () => ({ label: 'command-buffer' }) as unknown as GPUCommandBuffer,
  };
  const queue = {
    writeBuffer: (): void => {},
    submit: (): void => {},
    copyExternalImageToTexture: (): void => {},
    writeTexture: (): void => {},
  };
  const device = {
    createShaderModule: () => ({}) as GPUShaderModule,
    createBindGroupLayout: (descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout => {
      let textureEntries = 0;

      for (const entry of descriptor.entries) {
        if ((entry as GPUBindGroupLayoutEntry).texture !== undefined) {
          textureEntries++;
        }
      }

      textureLayoutEntryCounts.set(descriptor.label ?? '', textureEntries);

      return {} as GPUBindGroupLayout;
    },
    createPipelineLayout: () => ({}) as GPUPipelineLayout,
    createBindGroup: () => ({}) as GPUBindGroup,
    createRenderPipeline: () => ({}) as GPURenderPipeline,
    createCommandEncoder: () => encoder as unknown as GPUCommandEncoder,
    createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer =>
      ({
        label: descriptor.label ?? '',
        destroy: (): void => {},
      }) as unknown as GPUBuffer,
    createTexture: (): GPUTexture => {
      const view = {} as GPUTextureView;

      return {
        destroy: (): void => {},
        createView: () => view,
      } as unknown as GPUTexture;
    },
    createSampler: () => ({}) as GPUSampler,
    lost: new Promise<GPUDeviceLostInfo>(() => {}),
    queue,
    ...(options.deviceLimits !== undefined ? { limits: options.deviceLimits } : {}),
  } as unknown as GPUDevice;
  const context = {
    configure: (): void => {},
    unconfigure: (): void => {},
    getCurrentTexture: () =>
      ({
        createView: () => ({}) as GPUTextureView,
      }) as unknown as GPUTexture,
  } as unknown as GPUCanvasContext;
  const gpu = {
    requestAdapter: async () =>
      ({
        ...(options.adapterLimits !== undefined ? { limits: options.adapterLimits } : {}),
        requestDevice: async (descriptor?: GPUDeviceDescriptor) => {
          requestDeviceDescriptors.push(descriptor);

          return device;
        },
      }) as unknown as GPUAdapter,
    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
  } as unknown as GPU;
  const canvas = document.createElement('canvas');

  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });

  for (const [name, value] of globalStubs) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }

  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: (contextType: string) => (contextType === 'webgpu' ? context : null),
  });

  return {
    canvas,
    drawIndexedCount: () => drawIndexedCount,
    requestDeviceDescriptors: () => requestDeviceDescriptors,
    textureLayoutEntryCounts: () => textureLayoutEntryCounts,
    restore: (): void => {
      if (previousGpu) {
        Object.defineProperty(navigator, 'gpu', previousGpu);
      } else {
        Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
      }

      for (const [name, descriptor] of previousGlobals) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
        }
      }
    },
  };
};

const createBackend = async (environment: MockWebGpuEnvironment): Promise<WebGpuBackend> => {
  const app = {
    canvas: environment.canvas,
    options: {
      canvas: { width: 128, height: 128 },
      clearColor: Color.black,
    },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  materializeRendererBindings(backend, buildCoreRendererBindings({}));
  await backend.initialize();

  return backend;
};

const createCanvasTexture = (size = 16): Texture => {
  const sourceCanvas = document.createElement('canvas');

  sourceCanvas.width = size;
  sourceCanvas.height = size;

  const texture = new Texture(sourceCanvas);

  texture.generateMipMap = false;
  texture.updateSource();

  return texture;
};

/** One sprite per distinct texture, laid out on a grid inside the 128px view. */
const createDistinctTextureSprites = (count: number): { sprites: Sprite[]; textures: Texture[] } => {
  const textures = Array.from({ length: count }, () => createCanvasTexture());
  const sprites = textures.map((texture, i) => {
    const sprite = new Sprite(texture);

    sprite.setPosition((i % 16) * 8, Math.floor(i / 16) * 8);
    sprite.width = 8;
    sprite.height = 8;

    return sprite;
  });

  return { sprites, textures };
};

const renderFrame = (backend: WebGpuBackend, sprites: readonly Sprite[]): void => {
  backend.resetStats();
  backend.clear(Color.black);

  for (const sprite of sprites) {
    sprite.render(backend);
  }

  backend.flush();
};

/** drawIndexed calls issued by exactly one steady-state frame. */
const measureFrameDraws = (environment: MockWebGpuEnvironment, backend: WebGpuBackend, sprites: readonly Sprite[]): number => {
  renderFrame(backend, sprites); // warmup: uploads, pipelines, arena growth
  const before = environment.drawIndexedCount();

  renderFrame(backend, sprites);

  return environment.drawIndexedCount() - before;
};

describe('resolveSpriteBatchTextureSlots', () => {
  const makeDevice = (limits?: MockLimits): GPUDevice => ({ ...(limits !== undefined ? { limits } : {}) }) as unknown as GPUDevice;

  test('quantizes the granted limits to the 8 / 16 / 32 tiers', () => {
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 }))).toBe(16);
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 32, maxSamplersPerShaderStage: 32 }))).toBe(32);
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 1048576, maxSamplersPerShaderStage: 1048576 }))).toBe(32);
    // The tightest of the two limits drives the tier.
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 1048576, maxSamplersPerShaderStage: 16 }))).toBe(16);
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 24, maxSamplersPerShaderStage: 24 }))).toBe(16);
    // Below-spec limits collapse to the legacy 8-slot floor.
    expect(resolveSpriteBatchTextureSlots(makeDevice({ maxSampledTexturesPerShaderStage: 8, maxSamplersPerShaderStage: 8 }))).toBe(8);
  });

  test('a device without a limits object falls back to the legacy 8-slot path', () => {
    expect(resolveSpriteBatchTextureSlots(makeDevice())).toBe(8);
  });
});

describe('WebGPU sprite batcher texture-slot capacity', () => {
  test('16 distinct textures batch into ONE draw on a base-limits (16/16) device; the 17th splits', async () => {
    const limits: MockLimits = { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 };
    const environment = createMockWebGpuEnvironment({ adapterLimits: limits, deviceLimits: limits });

    try {
      const backend = await createBackend(environment);
      const sixteen = createDistinctTextureSprites(16);
      const seventeen = createDistinctTextureSprites(17);

      expect(measureFrameDraws(environment, backend, sixteen.sprites)).toBe(1);
      expect(measureFrameDraws(environment, backend, seventeen.sprites)).toBe(2);

      // The generated bind-group layout carries exactly 16 texture entries.
      expect(environment.textureLayoutEntryCounts().get('sprite:bind-group-layout:texture')).toBe(16);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('32 distinct textures batch into ONE draw when the device grants 32 slots; the 33rd splits', async () => {
    const adapterLimits: MockLimits = { maxSampledTexturesPerShaderStage: 1048576, maxSamplersPerShaderStage: 1048576 };
    const deviceLimits: MockLimits = { maxSampledTexturesPerShaderStage: 32, maxSamplersPerShaderStage: 32 };
    const environment = createMockWebGpuEnvironment({ adapterLimits, deviceLimits });

    try {
      const backend = await createBackend(environment);
      const thirtyTwo = createDistinctTextureSprites(32);
      const thirtyThree = createDistinctTextureSprites(33);

      expect(measureFrameDraws(environment, backend, thirtyTwo.sprites)).toBe(1);
      expect(measureFrameDraws(environment, backend, thirtyThree.sprites)).toBe(2);

      expect(environment.textureLayoutEntryCounts().get('sprite:bind-group-layout:texture')).toBe(32);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a limit-less mock device keeps the legacy 8-slot batching (9 textures split into 2 draws)', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const eight = createDistinctTextureSprites(8);
      const nine = createDistinctTextureSprites(9);

      expect(measureFrameDraws(environment, backend, eight.sprites)).toBe(1);
      expect(measureFrameDraws(environment, backend, nine.sprites)).toBe(2);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('requestDevice asks for at most 32 sampled textures / samplers when the adapter offers more', async () => {
    const adapterLimits: MockLimits = { maxSampledTexturesPerShaderStage: 1048576, maxSamplersPerShaderStage: 4096 };
    const deviceLimits: MockLimits = { maxSampledTexturesPerShaderStage: 32, maxSamplersPerShaderStage: 32 };
    const environment = createMockWebGpuEnvironment({ adapterLimits, deviceLimits });

    try {
      const backend = await createBackend(environment);
      const descriptors = environment.requestDeviceDescriptors();

      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]?.requiredLimits).toEqual({
        maxSampledTexturesPerShaderStage: 32,
        maxSamplersPerShaderStage: 32,
      });

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('requestDevice requests no extra limits when the adapter only offers the spec base (16/16)', async () => {
    const limits: MockLimits = { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 };
    const environment = createMockWebGpuEnvironment({ adapterLimits: limits, deviceLimits: limits });

    try {
      const backend = await createBackend(environment);
      const descriptors = environment.requestDeviceDescriptors();

      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]?.requiredLimits).toBeUndefined();

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an adapter without a limits object is not asked for requiredLimits', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const descriptors = environment.requestDeviceDescriptors();

      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]?.requiredLimits).toBeUndefined();

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
