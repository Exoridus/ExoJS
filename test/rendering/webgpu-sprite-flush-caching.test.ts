/**
 * WebGPU sprite flush hot-path caching (review finding F5b/B-05).
 *
 * The sprite flush used to create a fresh texture bind group (8 texture views
 * + 8 samplers) and rewrite the 128-byte projection/group uniform on EVERY
 * batch flush — per-frame GPU object churn that scales with flush count even
 * for completely static scenes.
 *
 * These tests drive the REAL WebGpuBackend + sprite renderer against a mock
 * device that counts createBindGroup calls and records writeBuffer targets by
 * buffer label, then require:
 *
 * - a static frame after warmup creates ZERO new bind groups and issues ZERO
 *   projection-uniform writes (while still drawing),
 * - a view mutation re-writes the projection exactly once,
 * - a new texture set builds a new bind group once and is cached thereafter.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

interface LabeledBuffer {
  readonly label: string;
  destroy(): void;
}

interface MockWebGpuEnvironment {
  readonly canvas: HTMLCanvasElement;
  bindGroupCount(): number;
  /** Labels of every created bind group, in call order. */
  bindGroupLabels(): readonly string[];
  /** Labels of every queue.writeBuffer target, in call order. */
  writeBufferLabels(): readonly string[];
  drawIndexedCount(): number;
  restore(): void;
}

const globalStubs: ReadonlyArray<readonly [string, unknown]> = [
  ['GPUBufferUsage', { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8, STORAGE: 16, COPY_SRC: 32 }],
  ['GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 }],
  ['GPUColorWrite', { ALL: 0xf }],
  ['GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 }],
];

const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  let bindGroupCount = 0;
  let drawIndexedCount = 0;
  const bindGroupLabels: string[] = [];
  const writeBufferLabels: string[] = [];

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
    writeBuffer: (buffer: LabeledBuffer): void => {
      writeBufferLabels.push(buffer.label);
    },
    submit: (): void => {},
    copyExternalImageToTexture: (): void => {},
    writeTexture: (): void => {},
  };
  const device = {
    createShaderModule: () => ({}) as GPUShaderModule,
    createBindGroupLayout: () => ({}) as GPUBindGroupLayout,
    createPipelineLayout: () => ({}) as GPUPipelineLayout,
    createBindGroup: (descriptor: GPUBindGroupDescriptor): GPUBindGroup => {
      bindGroupCount++;
      bindGroupLabels.push(descriptor.label ?? '');

      return {} as GPUBindGroup;
    },
    createRenderPipeline: () => ({}) as GPURenderPipeline,
    createCommandEncoder: () => encoder as unknown as GPUCommandEncoder,
    createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer =>
      ({
        label: descriptor.label ?? '',
        destroy: (): void => {},
      }) as unknown as GPUBuffer,
    createTexture: (): GPUTexture => {
      // A stable view per GPU texture, matching the backend's cached-view
      // contract (a fresh view identity means "texture was recreated").
      const view = {} as GPUTextureView;

      return {
        destroy: (): void => {},
        createView: () => view,
      } as unknown as GPUTexture;
    },
    createSampler: () => ({}) as GPUSampler,
    lost: new Promise<GPUDeviceLostInfo>(() => {}),
    queue,
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
        requestDevice: async () => device,
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
    bindGroupCount: () => bindGroupCount,
    bindGroupLabels: () => bindGroupLabels,
    writeBufferLabels: () => writeBufferLabels,
    drawIndexedCount: () => drawIndexedCount,
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

  // Keep the frame to pure content passes (mipmap generation opens its own).
  texture.generateMipMap = false;
  texture.updateSource();

  return texture;
};

const renderFrame = (backend: WebGpuBackend, sprites: readonly Sprite[]): void => {
  // resetStats is the frame boundary: it resets the frame-scoped transform
  // buffer (same driving pattern as the browser suite).
  backend.resetStats();
  backend.clear(Color.black);

  for (const sprite of sprites) {
    sprite.render(backend);
  }

  backend.flush();
};

const spriteUniformLabel = 'sprite:uniform-buffer';

const countLabel = (labels: readonly string[], label: string, from = 0): number => {
  let count = 0;

  for (let index = from; index < labels.length; index++) {
    if (labels[index] === label) {
      count++;
    }
  }

  return count;
};

describe('WebGPU sprite flush hot-path caching', () => {
  test('a static frame after warmup creates no new bind groups and skips the projection write', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const sprite = new Sprite(texture);

      // Warmup frame: builds pipelines, uploads the texture, creates the
      // transform + texture bind groups and writes the projection uniform.
      renderFrame(backend, [sprite]);

      expect(environment.bindGroupCount()).toBeGreaterThan(0);
      expect(countLabel(environment.writeBufferLabels(), spriteUniformLabel)).toBe(1);

      // Static frame: identical scene, identical view — everything GPU-object
      // shaped must come from caches.
      const bindGroupsAfterWarmup = environment.bindGroupCount();
      const writesAfterWarmup = environment.writeBufferLabels().length;
      const drawsAfterWarmup = environment.drawIndexedCount();

      renderFrame(backend, [sprite]);

      expect(environment.drawIndexedCount()).toBe(drawsAfterWarmup + 1); // still draws
      expect(environment.bindGroupLabels().slice(bindGroupsAfterWarmup)).toEqual([]);
      expect(countLabel(environment.writeBufferLabels(), spriteUniformLabel, writesAfterWarmup)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a view mutation re-writes the projection uniform exactly once', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const texture = createCanvasTexture();
      const sprite = new Sprite(texture);

      renderFrame(backend, [sprite]);
      renderFrame(backend, [sprite]);

      const writesBeforePan = environment.writeBufferLabels().length;

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), spriteUniformLabel, writesBeforePan)).toBe(1);

      // And the next unchanged frame skips again.
      const writesAfterPan = environment.writeBufferLabels().length;

      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), spriteUniformLabel, writesAfterPan)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a new texture set builds its bind group once and both sets stay cached', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const textureA = createCanvasTexture();
      const textureB = createCanvasTexture();
      const spriteA = new Sprite(textureA);
      const spriteB = new Sprite(textureB);

      // Warm up both single-texture sets first so texture-upload side effects
      // (first-use GPU texture creation) are out of the way, and render a
      // two-sprite frame so the shared transform storage grows to two rows up
      // front (growth legitimately rebuilds the transform bind group once).
      renderFrame(backend, [spriteA]);
      renderFrame(backend, [spriteB]);
      renderFrame(backend, [spriteA, new Sprite(textureA)]);

      const afterSingles = environment.bindGroupCount();

      // A new combined set {A, B} over already-uploaded textures costs exactly
      // one new (texture) bind group.
      renderFrame(backend, [spriteA, spriteB]);

      expect(environment.bindGroupCount() - afterSingles).toBe(1);

      const afterCombined = environment.bindGroupCount();

      renderFrame(backend, [spriteA]);
      renderFrame(backend, [spriteB]);
      renderFrame(backend, [spriteA, spriteB]);

      expect(environment.bindGroupCount() - afterCombined).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
