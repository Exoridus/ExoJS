/**
 * Browser-side WebGPU harness for the allocation audit.
 *
 * Deliberately NOT a port of `test/perf/rendering/harness.ts`: that one wires
 * the WebGL2 backend to a recording fake context in Node, and a fake context is
 * exactly what this measurement must not have - the question is what the real
 * `WebGpuBackend` allocates against a real `GPUDevice`, and a stub would either
 * invent allocations of its own or skip the paths under audit.
 *
 * What it shares with the Node harness is the frame shape (`resetStats` →
 * mutate → `clear` → `render` → `flush`) and the scene fixtures, so a WebGPU
 * number and a WebGL2 number describe the same work even though they are not
 * comparable in absolute terms.
 *
 * @internal Test/perf-only.
 */
import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import type { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from '../../rendering/browser/_coreRenderers';

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/**
 * WebGPU-side work units per frame, counted by wrapping the device queue rather
 * than read from `RenderStats`.
 *
 * `RenderStats` is backend-neutral by design and therefore says nothing about
 * the objects this audit is about: how many command buffers were submitted, how
 * many bind groups were built, how many `writeBuffer`/`writeTexture` calls the
 * frame issued. Without those denominators a KB/frame figure cannot be turned
 * into a per-work-unit cost, and an "allocation win" that quietly doubled the
 * submit count would read as a win.
 */
export interface WebGpuWorkCounters {
  writeBufferCalls: number;
  writeBufferBytes: number;
  writeTextureCalls: number;
  writeTextureBytes: number;
  submitCalls: number;
  commandBuffers: number;
  createBindGroupCalls: number;
  createBufferCalls: number;
  createTextureCalls: number;
  createRenderPipelineCalls: number;
}

export interface WebGpuHarness {
  readonly backend: WebGpuBackend;
  readonly device: GPUDevice;
  readonly view: View;
  readonly counters: WebGpuWorkCounters;
  resetCounters(): void;
  destroy(): void;
}

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      clearColor: Color.black,
      rendering: {
        debug: false,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  }) as unknown as Application;

/**
 * Instrument the device in place. Wrapping is the only option that sees every
 * caller: the renderers reach `device.queue` directly, and several of them hold
 * the queue for the lifetime of the connection, so the queue object itself is
 * patched rather than the getter.
 */
const instrument = (device: GPUDevice): { counters: WebGpuWorkCounters; reset: () => void } => {
  const counters: WebGpuWorkCounters = {
    writeBufferCalls: 0,
    writeBufferBytes: 0,
    writeTextureCalls: 0,
    writeTextureBytes: 0,
    submitCalls: 0,
    commandBuffers: 0,
    createBindGroupCalls: 0,
    createBufferCalls: 0,
    createTextureCalls: 0,
    createRenderPipelineCalls: 0,
  };

  const { queue } = device;
  const writeBuffer = queue.writeBuffer.bind(queue) as GPUQueue['writeBuffer'];
  const writeTexture = queue.writeTexture.bind(queue) as GPUQueue['writeTexture'];
  const submit = queue.submit.bind(queue) as GPUQueue['submit'];
  const createBindGroup = device.createBindGroup.bind(device);
  const createBuffer = device.createBuffer.bind(device);
  const createTexture = device.createTexture.bind(device);
  const createRenderPipeline = device.createRenderPipeline.bind(device);

  queue.writeBuffer = ((buffer: GPUBuffer, offset: number, data: BufferSource, dataOffset?: number, size?: number): void => {
    counters.writeBufferCalls++;
    counters.writeBufferBytes += size ?? data.byteLength;
    writeBuffer(buffer, offset, data, dataOffset, size);
  }) as GPUQueue['writeBuffer'];

  queue.writeTexture = ((destination: GPUTexelCopyTextureInfo, data: BufferSource, layout: GPUTexelCopyBufferLayout, size: GPUExtent3D): void => {
    counters.writeTextureCalls++;
    counters.writeTextureBytes += data.byteLength;
    writeTexture(destination, data, layout, size);
  }) as GPUQueue['writeTexture'];

  queue.submit = ((buffers: readonly GPUCommandBuffer[]): void => {
    counters.submitCalls++;
    counters.commandBuffers += buffers.length;
    submit(buffers);
  }) as GPUQueue['submit'];

  device.createBindGroup = (descriptor: GPUBindGroupDescriptor): GPUBindGroup => {
    counters.createBindGroupCalls++;

    return createBindGroup(descriptor);
  };

  device.createBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer => {
    counters.createBufferCalls++;

    return createBuffer(descriptor);
  };

  device.createTexture = (descriptor: GPUTextureDescriptor): GPUTexture => {
    counters.createTextureCalls++;

    return createTexture(descriptor);
  };

  device.createRenderPipeline = (descriptor: GPURenderPipelineDescriptor): GPURenderPipeline => {
    counters.createRenderPipelineCalls++;

    return createRenderPipeline(descriptor);
  };

  const reset = (): void => {
    counters.writeBufferCalls = 0;
    counters.writeBufferBytes = 0;
    counters.writeTextureCalls = 0;
    counters.writeTextureBytes = 0;
    counters.submitCalls = 0;
    counters.commandBuffers = 0;
    counters.createBindGroupCalls = 0;
    counters.createBufferCalls = 0;
    counters.createTextureCalls = 0;
    counters.createRenderPipelineCalls = 0;
  };

  return { counters, reset };
};

/** `null` when this browser has no adapter at all - a measurement result, not a failure. */
export const createWebGpuHarness = async (options: { instrument?: boolean } = {}): Promise<WebGpuHarness | null> => {
  if (typeof navigator.gpu === 'undefined') return null;

  const canvas = document.createElement('canvas');

  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);

  try {
    await backend.initialize();
  } catch {
    return null;
  }

  const { device } = backend;
  const wrapped = options.instrument === true ? instrument(device) : null;

  return {
    backend,
    device,
    view: backend.view,
    counters: wrapped?.counters ?? {
      writeBufferCalls: 0,
      writeBufferBytes: 0,
      writeTextureCalls: 0,
      writeTextureBytes: 0,
      submitCalls: 0,
      commandBuffers: 0,
      createBindGroupCalls: 0,
      createBufferCalls: 0,
      createTextureCalls: 0,
      createRenderPipelineCalls: 0,
    },
    resetCounters: (): void => wrapped?.reset(),
    destroy: (): void => backend.destroy(),
  };
};

/**
 * One frame, as lean as the Node sampler's: no `FrameMetrics` object, no
 * per-frame closure, nothing between the mutation hook and the backend.
 */
export const renderOnce = (harness: WebGpuHarness, root: RenderNode, beforeFrame?: () => void): void => {
  harness.backend.resetStats();
  beforeFrame?.();
  harness.backend.clear();
  root.render(harness.backend);
  harness.backend.flush();
};

/**
 * A real, sampleable texture. The Node fixtures build source-less `Texture`s -
 * enough for a fake context, rejected outright by the WebGPU backend, which
 * requires a valid source before it will upload.
 */
export const makeCanvasTexture = (size = 64, seed = 0): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');

  if (ctx === null) throw new Error('A 2D context is required to build the fixture texture.');

  ctx.fillStyle = `rgb(${(seed * 53) % 256}, ${(seed * 97) % 256}, ${(seed * 151) % 256})`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(0, 0, size / 2, size / 2);

  return new Texture(canvas);
};

export const makeCanvasTextures = (count: number, size = 64): Texture[] =>
  Array.from({ length: count }, (_unused, index) => makeCanvasTexture(size, index + 1));
