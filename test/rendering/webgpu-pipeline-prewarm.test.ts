/**
 * WebGPU pipeline prewarm — cache-key parity between prewarm and lookup.
 *
 * `prewarmPipelines` compiles every (blendMode × format) render pipeline
 * asynchronously at init so the first draw never blocks on synchronous WGSL
 * compilation. That only works when the prewarm stores its pipelines under
 * EXACTLY the keys the hot-path lookup queries: a key mismatch silently turns
 * the whole prewarm into dead weight — the async machinery runs, the cache
 * fills with unreachable entries, and every first draw still compiles
 * synchronously (review finding F5a/B-03: the sprite prewarm keyed
 * `${blend}:${format}` while lookups query `${blend}:${format}:${s|n}`).
 *
 * These tests run the real prewarm against a stub device, then perform the
 * real lookup for every prewarmed combination and require ZERO synchronous
 * pipeline creations. A second sweep asserts no unreachable (suffix-less)
 * keys remain in any cache.
 */

import { BlendModes } from '#rendering/types';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';

const prewarmedBlendModes: readonly BlendModes[] = [
  BlendModes.Normal,
  BlendModes.Additive,
  BlendModes.Subtract,
  BlendModes.Multiply,
  BlendModes.Screen,
  BlendModes.Darken,
  BlendModes.Lighten,
];

const formats: readonly GPUTextureFormat[] = ['bgra8unorm', 'rgba8unorm'];

// Every stored pipeline key must carry the stencil suffix the lookups append;
// a key without it can never be found again.
const lookupKeyPattern = /:(s|n)$/;

interface StubDevice {
  readonly device: GPUDevice;
  syncCreates(): number;
}

const createStubDevice = (): StubDevice => {
  let syncCreates = 0;

  const device = {
    createRenderPipeline: (): GPURenderPipeline => {
      syncCreates++;

      return {} as GPURenderPipeline;
    },
    createRenderPipelineAsync: async (): Promise<GPURenderPipeline> => ({}) as GPURenderPipeline,
  } as unknown as GPUDevice;

  return { device, syncCreates: () => syncCreates };
};

// _buildPipelineDescriptor reads the GPUColorWrite global, which jsdom does
// not provide.
const previousColorWrite = Object.getOwnPropertyDescriptor(globalThis, 'GPUColorWrite');

beforeAll(() => {
  Object.defineProperty(globalThis, 'GPUColorWrite', { configurable: true, value: { ALL: 0xf } });
});

afterAll(() => {
  if (previousColorWrite) {
    Object.defineProperty(globalThis, 'GPUColorWrite', previousColorWrite);
  } else {
    Object.defineProperty(globalThis, 'GPUColorWrite', { configurable: true, value: undefined });
  }
});

describe('WebGpuSpriteRenderer pipeline prewarm', () => {
  const setup = (): { renderer: WebGpuSpriteRenderer; stub: StubDevice; pipelines: Map<string, GPURenderPipeline> } => {
    const renderer = new WebGpuSpriteRenderer();
    const stub = createStubDevice();
    const internals = renderer as unknown as {
      _device: unknown;
      _shaderModule: unknown;
      _pipelineLayout: unknown;
      _backend: unknown;
      _pipelines: Map<string, GPURenderPipeline>;
    };

    internals._device = stub.device;
    internals._shaderModule = {};
    internals._pipelineLayout = {};
    internals._backend = {};

    return { renderer, stub, pipelines: internals._pipelines };
  };

  test('prewarmed pipelines are found by the hot-path lookup (no synchronous compiles)', async () => {
    const { renderer, stub } = setup();

    await renderer.prewarmPipelines(formats);

    const lookup = renderer as unknown as { _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline };

    for (const blendMode of prewarmedBlendModes) {
      for (const format of formats) {
        lookup._getPipeline(blendMode, format, false);
      }
    }

    expect(stub.syncCreates()).toBe(0);
  });

  test('the pipeline cache holds no unreachable (suffix-less) keys after prewarm', async () => {
    const { renderer, pipelines } = setup();

    await renderer.prewarmPipelines(formats);

    expect(pipelines.size).toBe(prewarmedBlendModes.length * formats.length);

    for (const key of pipelines.keys()) {
      expect(key).toMatch(lookupKeyPattern);
    }
  });
});

describe('WebGpuMeshRenderer pipeline prewarm', () => {
  const setup = (): {
    renderer: WebGpuMeshRenderer;
    stub: StubDevice;
    pipelines: Map<string, GPURenderPipeline>;
    instancedPipelines: Map<string, GPURenderPipeline>;
  } => {
    const renderer = new WebGpuMeshRenderer();
    const stub = createStubDevice();
    const internals = renderer as unknown as {
      _device: unknown;
      _shaderModule: unknown;
      _instancedShaderModule: unknown;
      _pipelineLayout: unknown;
      _instancedPipelineLayout: unknown;
      _pipelines: Map<string, GPURenderPipeline>;
      _instancedPipelines: Map<string, GPURenderPipeline>;
    };

    internals._device = stub.device;
    internals._shaderModule = {};
    internals._instancedShaderModule = {};
    internals._pipelineLayout = {};
    internals._instancedPipelineLayout = {};

    return { renderer, stub, pipelines: internals._pipelines, instancedPipelines: internals._instancedPipelines };
  };

  test('prewarmed default + instanced pipelines are found by the hot-path lookups', async () => {
    const { renderer, stub } = setup();

    await renderer.prewarmPipelines(formats);

    const lookup = renderer as unknown as {
      _getPipeline(key: { blendMode: BlendModes; format: GPUTextureFormat; stencil: boolean }): GPURenderPipeline;
      _getInstancedPipeline(key: { blendMode: BlendModes; format: GPUTextureFormat; stencil: boolean }): GPURenderPipeline;
    };

    for (const blendMode of prewarmedBlendModes) {
      for (const format of formats) {
        lookup._getPipeline({ blendMode, format, stencil: false });
        lookup._getInstancedPipeline({ blendMode, format, stencil: false });
      }
    }

    expect(stub.syncCreates()).toBe(0);
  });

  test('the pipeline caches hold no unreachable keys after prewarm', async () => {
    const { renderer, pipelines, instancedPipelines } = setup();

    await renderer.prewarmPipelines(formats);

    expect(pipelines.size).toBe(prewarmedBlendModes.length * formats.length);
    expect(instancedPipelines.size).toBe(prewarmedBlendModes.length * formats.length);

    for (const key of [...pipelines.keys(), ...instancedPipelines.keys()]) {
      expect(key).toMatch(lookupKeyPattern);
    }
  });
});

describe('WebGpuTextRenderer pipeline prewarm', () => {
  const shaderTypes = ['sdf', 'msdf', 'color'] as const;

  const setup = (): { renderer: WebGpuTextRenderer; stub: StubDevice; pipelines: Map<string, GPURenderPipeline> } => {
    const renderer = new WebGpuTextRenderer();
    const stub = createStubDevice();
    const internals = renderer as unknown as {
      _device: unknown;
      _shaderModule: unknown;
      _pipelineLayout: unknown;
      _pipelines: Map<string, GPURenderPipeline>;
    };

    internals._device = stub.device;
    internals._shaderModule = {};
    internals._pipelineLayout = {};

    return { renderer, stub, pipelines: internals._pipelines };
  };

  test('prewarmed pipelines are found by the hot-path lookup', async () => {
    const { renderer, stub } = setup();

    await renderer.prewarmPipelines(formats);

    const lookup = renderer as unknown as { _getPipeline(shaderType: 'sdf' | 'msdf' | 'color', format: GPUTextureFormat, stencil: boolean): GPURenderPipeline };

    for (const shaderType of shaderTypes) {
      for (const format of formats) {
        lookup._getPipeline(shaderType, format, false);
      }
    }

    expect(stub.syncCreates()).toBe(0);
  });

  test('the pipeline cache holds no unreachable keys after prewarm', async () => {
    const { renderer, pipelines } = setup();

    await renderer.prewarmPipelines(formats);

    expect(pipelines.size).toBe(shaderTypes.length * formats.length);

    for (const key of pipelines.keys()) {
      expect(key).toMatch(lookupKeyPattern);
    }
  });
});
