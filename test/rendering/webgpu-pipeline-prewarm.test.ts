/**
 * WebGPU pipeline prewarm - cache-key parity between prewarm and lookup.
 *
 * `prewarmPipelines` compiles every (blendMode × format) render pipeline
 * asynchronously at init so the first draw never blocks on synchronous WGSL
 * compilation. That only works when the prewarm stores its pipelines under
 * EXACTLY the keys the hot-path lookup queries: a key mismatch silently turns
 * the whole prewarm into dead weight - the async machinery runs, the cache
 * fills with unreachable entries, and every first draw still compiles
 * synchronously - the sprite prewarm used to key
 * `${blend}:${format}` while lookups query `${blend}:${format}:${s|n}`.
 *
 * These tests run the real prewarm against a stub device, then perform the
 * real lookup for every prewarmed combination and require ZERO synchronous
 * pipeline creations. A second sweep asserts no unreachable (suffix-less) keys
 * remain in the caches that are still keyed by a built string. The sprite
 * renderer's cache no longer is - it keys on `(format, packed variant)` - so
 * its second test asserts the same property behaviourally instead.
 */

import { BlendModes } from '#rendering/types';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuNineSliceSpriteRenderer } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { WebGpuRepeatingSpriteRenderer } from '#rendering/webgpu/WebGpuRepeatingSpriteRenderer';
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
  const setup = (): { renderer: WebGpuSpriteRenderer; stub: StubDevice } => {
    const renderer = new WebGpuSpriteRenderer();
    const stub = createStubDevice();
    const internals = renderer as unknown as {
      _device: unknown;
      _shaderModule: unknown;
      _pipelineLayout: unknown;
      _backend: unknown;
    };

    internals._device = stub.device;
    internals._shaderModule = {};
    internals._pipelineLayout = {};
    internals._backend = {};

    return { renderer, stub };
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

  // The sprite cache is keyed structurally (format, then a packed
  // blend-mode/stencil variant) rather than by a built string, so there is no
  // key spelling left to assert. The property the string check stood for is
  // asserted behaviourally instead, and more strictly: the prewarmed set is hit
  // without a synchronous compile, and the set outside it still compiles - so a
  // prewarm that filled the wrong variants would fail on one side or the other.
  test('prewarm fills exactly the non-stencil variants, and the stencil ones stay lazy', async () => {
    const { renderer, stub } = setup();

    await renderer.prewarmPipelines(formats);

    const lookup = renderer as unknown as { _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline };

    for (const blendMode of prewarmedBlendModes) {
      for (const format of formats) {
        lookup._getPipeline(blendMode, format, false);
      }
    }

    expect(stub.syncCreates()).toBe(0);

    lookup._getPipeline(BlendModes.Normal, formats[0]!, true);

    expect(stub.syncCreates()).toBe(1);
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

describe('WebGpuNineSliceSpriteRenderer pipeline prewarm', () => {
  const setup = (): { renderer: WebGpuNineSliceSpriteRenderer; stub: StubDevice; pipelines: Map<string, GPURenderPipeline> } => {
    const renderer = new WebGpuNineSliceSpriteRenderer();
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

describe('WebGpuRepeatingSpriteRenderer pipeline prewarm', () => {
  const kinds = ['shader', 'geo'] as const;

  const setup = (): { renderer: WebGpuRepeatingSpriteRenderer; stub: StubDevice; pipelines: Map<string, GPURenderPipeline> } => {
    const renderer = new WebGpuRepeatingSpriteRenderer();
    const stub = createStubDevice();
    const internals = renderer as unknown as {
      _device: unknown;
      _shaderModule: unknown;
      _uniformBindGroupLayout: unknown;
      _textureBindGroupLayout: unknown;
      _pipelineLayout: unknown;
      _pipelines: Map<string, GPURenderPipeline>;
    };

    internals._device = stub.device;
    internals._shaderModule = {};
    internals._uniformBindGroupLayout = {};
    internals._textureBindGroupLayout = {};
    internals._pipelineLayout = {};

    return { renderer, stub, pipelines: internals._pipelines };
  };

  test('prewarmed shader + geometry pipelines are found by the hot-path lookup', async () => {
    const { renderer, stub } = setup();

    await renderer.prewarmPipelines(formats);

    const lookup = renderer as unknown as {
      _getPipeline(kind: 'shader' | 'geo', blend: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline;
    };

    for (const kind of kinds) {
      for (const blendMode of prewarmedBlendModes) {
        for (const format of formats) {
          lookup._getPipeline(kind, blendMode, format, false);
        }
      }
    }

    expect(stub.syncCreates()).toBe(0);
  });

  test('the pipeline cache holds no unreachable keys after prewarm', async () => {
    const { renderer, pipelines } = setup();

    await renderer.prewarmPipelines(formats);

    expect(pipelines.size).toBe(kinds.length * prewarmedBlendModes.length * formats.length);

    for (const key of pipelines.keys()) {
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

    const lookup = renderer as unknown as {
      _getPipeline(shaderType: 'sdf' | 'msdf' | 'color', blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline;
    };

    // Prewarm covers the default blend mode only, which is the one the lookup
    // asks for on all but a deliberately blended text node.
    for (const shaderType of shaderTypes) {
      for (const format of formats) {
        lookup._getPipeline(shaderType, BlendModes.Normal, format, false);
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
