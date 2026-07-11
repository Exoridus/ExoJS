/**
 * Shared mock WebGPU environment for renderer flush hot-path caching tests.
 *
 * Drives the REAL WebGpuBackend + core renderers against a mock device that
 * counts createBindGroup calls and records writeBuffer / drawIndexed targets by
 * label, so structural tests can assert per-flush GPU-object churn (bind
 * groups, projection-uniform writes) without a real adapter. A stable
 * per-GPU-texture view models the backend's cached-view contract (a fresh view
 * identity means "texture was recreated").
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

interface LabeledBuffer {
  readonly label: string;
  destroy(): void;
}

export interface MockWebGpuEnvironment {
  readonly canvas: HTMLCanvasElement;
  bindGroupCount(): number;
  /** Labels of every created bind group, in call order. */
  bindGroupLabels(): readonly string[];
  /** Labels of every queue.writeBuffer target, in call order. */
  writeBufferLabels(): readonly string[];
  /** Number of render pipelines synchronously created (async prewarm excluded). */
  syncPipelineCount(): number;
  drawIndexedCount(): number;
  restore(): void;
}

const globalStubs: ReadonlyArray<readonly [string, unknown]> = [
  ['GPUBufferUsage', { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8, STORAGE: 16, COPY_SRC: 32 }],
  ['GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 }],
  ['GPUColorWrite', { ALL: 0xf }],
  ['GPUTextureUsage', { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 }],
];

export const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousGlobals = globalStubs.map(([name]) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

  let bindGroupCount = 0;
  let drawIndexedCount = 0;
  let syncPipelineCount = 0;
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
    createRenderPipeline: (): GPURenderPipeline => {
      syncPipelineCount++;

      return {} as GPURenderPipeline;
    },
    createRenderPipelineAsync: async (): Promise<GPURenderPipeline> => ({}) as GPURenderPipeline,
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
    syncPipelineCount: () => syncPipelineCount,
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

export const createMockBackend = async (environment: MockWebGpuEnvironment): Promise<WebGpuBackend> => {
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

export const createCanvasTexture = (size = 16): Texture => {
  const sourceCanvas = document.createElement('canvas');

  sourceCanvas.width = size;
  sourceCanvas.height = size;

  const texture = new Texture(sourceCanvas);

  // Keep the frame to pure content passes (mipmap generation opens its own).
  texture.generateMipMap = false;
  texture.updateSource();

  return texture;
};

export const countLabel = (labels: readonly string[], label: string, from = 0): number => {
  let count = 0;

  for (let index = from; index < labels.length; index++) {
    if (labels[index] === label) {
      count++;
    }
  }

  return count;
};
