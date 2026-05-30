/// <reference types="@webgpu/types" />

/**
 * WebGpuShaderFilter unit tests.
 *
 * These tests use a minimal WebGPU mock (same pattern as webgpu-backend.test.ts)
 * to verify the WebGpuShaderFilter's construction, apply() pipeline/bind-group
 * setup, uniform marshalling, WebGL2 guard, and lifecycle methods.
 */

import type { WebGpuShaderFilterOptions } from '@/rendering/filters/WebGpuShaderFilter';
import { WebGpuShaderFilter } from '@/rendering/filters/WebGpuShaderFilter';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import type { View } from '@/rendering/View';
import type { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { type WebGpuPassBackend, WebGpuPassCoordinator } from '@/rendering/webgpu/WebGpuPassCoordinator';

// ---------------------------------------------------------------------------
// WebGPU mock environment (mirrors webgpu-backend.test.ts pattern)
// ---------------------------------------------------------------------------

interface MockWebGpuEnv {
  readonly device: GPUDevice;
  readonly pass: {
    setPipeline: MockInstance;
    setVertexBuffer: MockInstance;
    setBindGroup: MockInstance;
    draw: MockInstance;
    end: MockInstance;
  };
  readonly encoder: {
    beginRenderPass: MockInstance;
    finish: MockInstance;
  };
  readonly queue: {
    writeBuffer: MockInstance;
    submit: MockInstance;
  };
  readonly createShaderModule: MockInstance;
  readonly createBindGroupLayout: MockInstance;
  readonly createPipelineLayout: MockInstance;
  readonly createBindGroup: MockInstance;
  readonly createRenderPipeline: MockInstance;
  readonly createBuffer: MockInstance;
  readonly createSampler: MockInstance;
  readonly buffers: { destroy: MockInstance; size: number }[];
  restore(): void;
}

function createMockWebGpuEnv(): MockWebGpuEnv {
  const previousBufferUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
  const previousShaderStage = Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage');

  const pass = {
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };

  const encoder = {
    beginRenderPass: vi.fn(() => pass),
    finish: vi.fn(() => ({}) as GPUCommandBuffer),
  };

  const queue = {
    writeBuffer: vi.fn(),
    submit: vi.fn(),
  };

  const createShaderModule = vi.fn(() => ({}) as GPUShaderModule);
  const createBindGroupLayout = vi.fn(() => ({}) as GPUBindGroupLayout);
  const createPipelineLayout = vi.fn(() => ({}) as GPUPipelineLayout);
  const createBindGroup = vi.fn(() => ({}) as GPUBindGroup);
  const createRenderPipeline = vi.fn(() => ({}) as GPURenderPipeline);
  const createSampler = vi.fn(() => ({}) as GPUSampler);
  const buffers: { destroy: MockInstance; size: number }[] = [];
  const createBuffer = vi.fn((desc: { size: number; usage: number }) => {
    const buf = { destroy: vi.fn(), size: desc.size };

    buffers.push(buf);

    return buf as unknown as GPUBuffer;
  });

  const device = {
    createShaderModule,
    createBindGroupLayout,
    createPipelineLayout,
    createBindGroup,
    createRenderPipeline,
    createBuffer,
    createSampler,
    createCommandEncoder: vi.fn(() => encoder),
    queue,
  } as unknown as GPUDevice;

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8 },
  });

  Object.defineProperty(globalThis, 'GPUShaderStage', {
    configurable: true,
    value: { VERTEX: 1, FRAGMENT: 2 },
  });

  return {
    device,
    pass,
    encoder,
    queue,
    createShaderModule,
    createBindGroupLayout,
    createPipelineLayout,
    createBindGroup,
    createRenderPipeline,
    createBuffer,
    createSampler,
    buffers,
    restore(): void {
      if (previousBufferUsage) {
        Object.defineProperty(globalThis, 'GPUBufferUsage', previousBufferUsage);
      } else {
        Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: undefined });
      }

      if (previousShaderStage) {
        Object.defineProperty(globalThis, 'GPUShaderStage', previousShaderStage);
      } else {
        Object.defineProperty(globalThis, 'GPUShaderStage', { configurable: true, value: undefined });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// WebGPU backend mock
// ---------------------------------------------------------------------------

interface MockWebGpuBackendExtras {
  execute: MockInstance;
  getTextureBinding: MockInstance;
  device: GPUDevice;
  renderTargetFormat: GPUTextureFormat;
  createColorAttachment: MockInstance;
  submit: MockInstance;
  stats: ReturnType<typeof createRenderStats>;
}

function makeWebGpuBackend(env: MockWebGpuEnv): RenderBackend & WebGpuBackend & MockWebGpuBackendExtras {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

  const execute = vi.fn(pass => {
    pass.execute(backend);
    return backend;
  });
  const getTextureBinding = vi.fn(() => ({
    view: {} as GPUTextureView,
    sampler: {} as GPUSampler,
  }));
  const createColorAttachment = vi.fn(() => ({
    view: {} as GPUTextureView,
    clearValue: { r: 0, g: 0, b: 0, a: 0 },
    loadOp: 'clear' as GPULoadOp,
    storeOp: 'store' as GPUStoreOp,
  }));
  const submit = vi.fn();

  const backend = {
    backendType: RenderBackendType.WebGpu,
    stats,
    device: env.device,
    renderTargetFormat: 'rgba8unorm' as GPUTextureFormat,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(view: View | null) {
      currentTarget.setView(view);
      return this;
    },
    setRenderTarget(target: RenderTarget | null) {
      currentTarget = target ?? root;

      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    pushStencilClip() {
      return this;
    },
    popStencilClip() {
      return this;
    },
    getScissorRect() {
      return null;
    },
    _targetHasContent() {
      return false;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w: number, h: number) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
    execute,
    getTextureBinding,
    createColorAttachment,
    submit,
  } as unknown as RenderBackend & WebGpuBackend & MockWebGpuBackendExtras;

  // The shader filter records into the backend-owned coordinator's active pass;
  // give the mock a real coordinator over itself (it satisfies WebGpuPassBackend).
  (backend as unknown as { _passCoordinator: WebGpuPassCoordinator })._passCoordinator = new WebGpuPassCoordinator(backend as unknown as WebGpuPassBackend);

  return backend;
}

function makeWebGl2Backend(): RenderBackend {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

  return {
    backendType: RenderBackendType.WebGl2,
    stats,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(view: View | null) {
      currentTarget.setView(view);
      return this;
    },
    setRenderTarget(target: RenderTarget | null) {
      currentTarget = target ?? root;
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(w: number, h: number) {
      return new RenderTexture(w, h);
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
  } as unknown as RenderBackend;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimalFragSrc = `
@group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexture, uSampler, vUv);
}
`;

const customVertSrc = `
struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) vUv: vec2<f32>,
};

@vertex
fn main(@location(0) aPosition: vec2<f32>, @location(1) aUv: vec2<f32>) -> VsOut {
    var out: VsOut;
    out.position = vec4<f32>(aPosition, 0.0, 1.0);
    out.vUv = aUv;
    return out;
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGpuShaderFilter', () => {
  let env: MockWebGpuEnv;

  beforeEach(() => {
    env = createMockWebGpuEnv();
  });

  afterEach(() => {
    env.restore();
  });

  // 1. Construction with fragmentSource only — succeeds
  test('constructs successfully with only fragmentSource', () => {
    expect(() => new WebGpuShaderFilter({ fragmentSource: minimalFragSrc })).not.toThrow();
  });

  // 2. Construction without fragmentSource — throws
  test('throws when constructed without fragmentSource', () => {
    expect(() => new WebGpuShaderFilter({} as WebGpuShaderFilterOptions)).toThrow('WebGpuShaderFilter requires fragmentSource.');
  });

  // 3. Default vertex shader is used when none provided
  test('uses default vertex shader when vertexSource is omitted', () => {
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const vs = (filter as unknown as Record<string, unknown>)['_vertexSource'] as string;

    expect(vs).toContain('aPosition');
    expect(vs).toContain('aUv');
    expect(vs).toContain('vUv');

    filter.destroy();
  });

  // 4. Custom vertex shader is used when provided
  test('uses provided vertexSource when specified', () => {
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      vertexSource: customVertSrc,
    });

    expect((filter as unknown as Record<string, unknown>)['_vertexSource']).toBe(customVertSrc);

    filter.destroy();
  });

  // 5. uniforms map is mutable
  test('uniforms map allows runtime mutation via property assignment', () => {
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });

    filter.uniforms['uTime'] = 1.234;
    filter.uniforms['uColor'] = [1, 0.5, 0, 1] as unknown as readonly [number, number, number, number];

    expect(filter.uniforms['uTime']).toBe(1.234);
    expect(filter.uniforms['uColor']).toEqual([1, 0.5, 0, 1]);

    filter.destroy();
  });

  // 6. Initial uniforms from constructor options populate the map
  test('constructor uniforms option populates the uniforms map', () => {
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: {
        uTime: 0.5,
        uScale: [2, 2] as unknown as readonly [number, number],
      },
    });

    expect(filter.uniforms['uTime']).toBe(0.5);
    expect(filter.uniforms['uScale']).toEqual([2, 2]);

    filter.destroy();
  });

  // 7. apply() on WebGL2 backend throws clearly
  test('apply() on WebGL2 backend throws with clear error message', () => {
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    expect(() => filter.apply(backend, input, output)).toThrow('WebGpuShaderFilter requires the WebGPU backend. Use WebGl2ShaderFilter on WebGL2.');

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 8. apply() on WebGPU creates shader modules
  test('apply() creates vertex and fragment shader modules', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(64, 64);
    const output = new RenderTexture(64, 64);

    filter.apply(backend, input, output);

    // Two shader modules: vertex + fragment
    expect(env.createShaderModule).toHaveBeenCalledTimes(2);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 9. apply() creates bind group layouts + pipeline layout + render pipeline
  test('apply() creates bind group layouts, pipeline layout, and render pipeline', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(32, 32);

    filter.apply(backend, input, output);

    expect(env.createBindGroupLayout).toHaveBeenCalledTimes(2); // auto + user
    expect(env.createPipelineLayout).toHaveBeenCalledTimes(1);
    expect(env.createRenderPipeline).toHaveBeenCalledTimes(1);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 10. apply() encodes render pass with pipeline + vertex buffer + bind groups + draw(4)
  test('apply() encodes render pass: setPipeline, setVertexBuffer, setBindGroup×2, draw(4)', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(32, 32);

    filter.apply(backend, input, output);

    expect(env.pass.setPipeline).toHaveBeenCalledTimes(1);
    expect(env.pass.setVertexBuffer).toHaveBeenCalledTimes(1);
    expect(env.pass.setBindGroup).toHaveBeenCalledTimes(2); // group 0 + group 1
    expect(env.pass.draw).toHaveBeenCalledWith(4);
    expect(env.pass.end).toHaveBeenCalledTimes(1);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 11. apply() writes resolution uniform buffer each frame
  test('apply() calls queue.writeBuffer to update the resolution uniform', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(128, 64);

    filter.apply(backend, input, output);

    // writeBuffer should have been called at least once (resolution + vertex buffer upload on init)
    expect(env.queue.writeBuffer).toHaveBeenCalled();

    // Find the call that wrote resolution data [128, 64, ...]
    const resCall = env.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2] as Float32Array;

      return data instanceof Float32Array && data[0] === 128 && data[1] === 64;
    });

    expect(resCall).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 12. Number uniform → 16-byte aligned slot in the user UBO
  test('number uniform is placed at the start of a 16-byte slot', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: { uTime: 3.14 },
    });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // Find the writeBuffer call for the user UBO (size = 16 bytes = 1 slot)
    const userUboCall = env.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2] as Float32Array;

      return data instanceof Float32Array && data.length === 4 && Math.abs(data[0] - 3.14) < 0.001;
    });

    expect(userUboCall).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 13. Vec3 uniform → 16-byte aligned slot (not 12-byte)
  test('vec3 uniform occupies a 16-byte aligned slot (not 12-byte)', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: {
        uVec3: [1, 2, 3] as unknown as readonly [number, number, number],
        uFloat: 9.9,
      },
    });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // With 16-byte alignment per slot:
    //   slot 0 (floats 0..3) = [1, 2, 3, 0]   (vec3, padded)
    //   slot 1 (floats 4..7) = [9.9, 0, 0, 0] (float)
    // Buffer is 2 slots = 32 bytes = 8 floats
    const userUboCall = env.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2] as Float32Array;

      return data instanceof Float32Array && data.length === 8 && data[0] === 1 && data[1] === 2 && data[2] === 3 && Math.abs(data[4] - 9.9) < 0.001;
    });

    expect(userUboCall).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 14. Vec4 uniform → 16-byte aligned slot
  test('vec4 uniform occupies a 16-byte aligned slot', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: {
        uColor: [0.1, 0.2, 0.3, 0.4] as unknown as readonly [number, number, number, number],
      },
    });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const userUboCall = env.queue.writeBuffer.mock.calls.find((args: unknown[]) => {
      const data = args[2] as Float32Array;

      return data instanceof Float32Array && data.length === 4 && Math.abs(data[0] - 0.1) < 0.001 && Math.abs(data[3] - 0.4) < 0.001;
    });

    expect(userUboCall).toBeDefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 15. Texture uniform → separate bind group entry, not in the UBO
  test('texture uniform results in getTextureBinding call and separate bind group entry', () => {
    const backend = makeWebGpuBackend(env);
    const canvas = document.createElement('canvas');

    canvas.width = 8;
    canvas.height = 8;
    const extraTex = new Texture(canvas);

    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: { uExtraTex: extraTex },
    });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    // getTextureBinding is called for input texture AND for the extra texture
    expect(backend.getTextureBinding).toHaveBeenCalledWith(extraTex);

    filter.destroy();
    input.destroy();
    output.destroy();
    extraTex.destroy();
  });

  // 16. _ensureConnected is idempotent — second apply() reuses the pipeline
  test('second apply() reuses the already-created pipeline (no new createRenderPipeline call)', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const pipelineCallsAfterFirst = env.createRenderPipeline.mock.calls.length;

    filter.apply(backend, input, output);

    expect(env.createRenderPipeline.mock.calls.length).toBe(pipelineCallsAfterFirst);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 17. destroy() releases GPU buffers
  test('destroy() releases vertex buffer and resolution buffer', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    expect((filter as unknown as Record<string, unknown>)['_connection']).not.toBeNull();

    filter.destroy();

    expect((filter as unknown as Record<string, unknown>)['_connection']).toBeNull();

    // At least the vertex buffer and resolution buffer should have been destroyed
    const destroyedCount = env.buffers.filter(b => b.destroy.mock.calls.length > 0).length;

    expect(destroyedCount).toBeGreaterThanOrEqual(2);

    input.destroy();
    output.destroy();
  });

  // 18. destroy() clears the uniforms map
  test('destroy() clears the uniforms map', () => {
    const filter = new WebGpuShaderFilter({
      fragmentSource: minimalFragSrc,
      uniforms: { uTime: 1.0 },
    });

    filter.destroy();

    expect(Object.keys(filter.uniforms)).toHaveLength(0);
  });

  // 19. connection is null before first apply() (lazy initialization)
  test('_connection is null before first apply() (lazy initialization)', () => {
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });

    expect((filter as unknown as Record<string, unknown>)['_connection']).toBeNull();

    filter.destroy();
  });

  // 20. apply() calls backend.execute (uses RenderTargetPass)
  test('apply() on WebGPU backend calls backend.execute', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(32, 32);

    filter.apply(backend, input, output);

    expect(backend.execute).toHaveBeenCalledTimes(1);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 21. Render pipeline uses triangle-strip topology
  test('render pipeline is created with triangle-strip topology', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(32, 32);

    filter.apply(backend, input, output);

    const pipelineDesc = env.createRenderPipeline.mock.calls[0][0] as GPURenderPipelineDescriptor;

    expect(pipelineDesc.primitive!.topology).toBe('triangle-strip');

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  // 22. Auto bind group layout has 3 entries: UBO, texture, sampler
  test('auto bind group layout has 3 entries (resolution UBO, texture, sampler)', () => {
    const backend = makeWebGpuBackend(env);
    const filter = new WebGpuShaderFilter({ fragmentSource: minimalFragSrc });
    const input = new RenderTexture(32, 32);
    const output = new RenderTexture(32, 32);

    filter.apply(backend, input, output);

    // First createBindGroupLayout call is for the auto group
    const autoLayoutDesc = env.createBindGroupLayout.mock.calls[0][0] as GPUBindGroupLayoutDescriptor;

    expect(autoLayoutDesc.entries).toHaveLength(3);

    filter.destroy();
    input.destroy();
    output.destroy();
  });
});
