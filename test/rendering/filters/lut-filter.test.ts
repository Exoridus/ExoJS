/**
 * LutFilter unit tests.
 *
 * LutFilter is a thin wrapper: its static factories rasterize LUT textures via
 * the 2D canvas API, and `apply()` lazily builds + delegates to a real
 * `WebGl2ShaderFilter` or `WebGpuShaderFilter` (both already covered by their
 * own dedicated test files) based on `backend.backendType`. These tests focus
 * on LutFilter's own logic: texture generation, option defaults/clamping,
 * `setLut`, backend selection, and lifecycle — using the same minimal
 * WebGL2/WebGPU backend mocks established in web-gl2-shader-filter.test.ts /
 * web-gpu-shader-filter.test.ts, not a from-scratch GPU simulation.
 *
 * The shared jsdom canvas 2D context stub (test/setup-env.vitest.ts) only
 * implements `fillStyle`/`fillRect`/`drawImage` — LutFilter's identity-LUT
 * builders also need `createImageData`/`putImageData`, so this file installs
 * a fuller local mock for the duration of the suite and restores the
 * original afterwards.
 */

import { LutFilter } from '#rendering/filters/LutFilter';
import { WebGl2ShaderFilter } from '#rendering/filters/WebGl2ShaderFilter';
import { WebGpuShaderFilter } from '#rendering/filters/WebGpuShaderFilter';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import type { View } from '#rendering/View';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { type WebGpuPassBackend, WebGpuPassCoordinator } from '#rendering/webgpu/WebGpuPassCoordinator';

// ---------------------------------------------------------------------------
// Fuller canvas 2D context mock (createImageData/putImageData support)
// ---------------------------------------------------------------------------

interface FakeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

function makeFullContext2d(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    createImageData: vi.fn(
      (width: number, height: number): FakeImageData => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
    ),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

let getContextSpy: MockInstance;

beforeAll(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeFullContext2d());
});

afterAll(() => {
  getContextSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Minimal backend mocks (mirrors the pattern in the WebGl2/WebGpu shader
// filter test files — just enough surface for apply() to run end-to-end).
// ---------------------------------------------------------------------------

function makeWebGl2Backend(): RenderBackend & WebGl2Backend {
  const root = new RenderTarget(64, 64, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

  const gl = {
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    useProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteVertexArray: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bindVertexArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    drawArrays: vi.fn(),
    uniform1f: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1i: vi.fn(),
    uniformMatrix2fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    getExtension: vi.fn(() => null),
    getShaderParameter: vi.fn(() => true),
    getProgramParameter: vi.fn((_prog: unknown, pname: number) => {
      if (pname === 35714) return true; // LINK_STATUS
      if (pname === 35721) return 2; // ACTIVE_ATTRIBUTES
      if (pname === 35718) return 0; // ACTIVE_UNIFORMS
      if (pname === 35382) return 0; // ACTIVE_UNIFORM_BLOCKS
      return true;
    }),
    getActiveAttrib: vi.fn(
      (_prog: unknown, i: number) =>
        [
          { name: 'aPosition', type: 35664, size: 1 },
          { name: 'aUv', type: 35664, size: 1 },
        ][i] ?? null,
    ),
    getActiveUniform: vi.fn(() => null),
    getActiveUniforms: vi.fn(() => []),
    getActiveUniformBlockName: vi.fn(() => null),
    getUniformBlockIndex: vi.fn(() => 0),
    getShaderInfoLog: vi.fn(() => ''),
    getProgramInfoLog: vi.fn(() => ''),
    getAttribLocation: vi.fn((_prog: unknown, name: string) => (name === 'aPosition' ? 0 : name === 'aUv' ? 1 : -1)),
    getUniformLocation: vi.fn(() => ({})),
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_ATTRIBUTES: 35721,
    ACTIVE_UNIFORMS: 35718,
    UNIFORM_BLOCK_INDEX: 35581,
    ACTIVE_UNIFORM_BLOCKS: 35382,
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TRIANGLE_STRIP: 5,
  } as unknown as WebGL2RenderingContext;

  return {
    backendType: RenderBackendType.WebGl2,
    stats,
    context: gl,
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
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
    bindShader: vi.fn(),
    bindTexture: vi.fn(),
    bindVertexArrayObject: vi.fn(),
    execute: vi.fn(function (this: unknown, pass: { execute(b: unknown): void }) {
      pass.execute(this);
      return this;
    }),
  } as unknown as RenderBackend & WebGl2Backend;
}

function makeWebGpuEnv(): { device: GPUDevice; restore(): void } {
  const previousBufferUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
  const previousShaderStage = Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage');

  const pass = { setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() };
  const encoder = { beginRenderPass: vi.fn(() => pass), finish: vi.fn(() => ({}) as GPUCommandBuffer) };
  const queue = { writeBuffer: vi.fn(), submit: vi.fn() };

  const device = {
    createShaderModule: vi.fn(() => ({}) as GPUShaderModule),
    createBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
    createPipelineLayout: vi.fn(() => ({}) as GPUPipelineLayout),
    createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    createRenderPipeline: vi.fn(() => ({}) as GPURenderPipeline),
    createBuffer: vi.fn(() => ({ destroy: vi.fn(), size: 16 }) as unknown as GPUBuffer),
    createSampler: vi.fn(() => ({}) as GPUSampler),
    createCommandEncoder: vi.fn(() => encoder),
    queue,
  } as unknown as GPUDevice;

  Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: { COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8 } });
  Object.defineProperty(globalThis, 'GPUShaderStage', { configurable: true, value: { VERTEX: 1, FRAGMENT: 2 } });

  return {
    device,
    restore(): void {
      if (previousBufferUsage) Object.defineProperty(globalThis, 'GPUBufferUsage', previousBufferUsage);
      if (previousShaderStage) Object.defineProperty(globalThis, 'GPUShaderStage', previousShaderStage);
    },
  };
}

function makeWebGpuBackend(device: GPUDevice): RenderBackend & WebGpuBackend {
  const root = new RenderTarget(64, 64, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

  const backend = {
    backendType: RenderBackendType.WebGpu,
    stats,
    device,
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
    execute(pass: { execute(b: unknown): void }) {
      pass.execute(this);
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
    getTextureBinding: vi.fn(() => ({ view: {} as GPUTextureView, sampler: {} as GPUSampler })),
    getTextureFormat: vi.fn(() => 'rgba8unorm' as GPUTextureFormat),
    createColorAttachment: vi.fn(
      () =>
        ({
          view: {} as GPUTextureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear' as GPULoadOp,
          storeOp: 'store' as GPUStoreOp,
        }) as GPURenderPassColorAttachment,
    ),
    submit: vi.fn(),
  } as unknown as RenderBackend & WebGpuBackend;

  (backend as unknown as { _passCoordinator: WebGpuPassCoordinator })._passCoordinator = new WebGpuPassCoordinator(backend as unknown as WebGpuPassBackend);

  return backend;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LutFilter static texture factories', () => {
  test('identityLut1D builds an N×1 texture with default size 256', () => {
    const texture = LutFilter.identityLut1D();

    expect(texture).toBeInstanceOf(Texture);
    expect(texture.width).toBe(256);
    expect(texture.height).toBe(1);
  });

  test('identityLut1D accepts a custom size', () => {
    const texture = LutFilter.identityLut1D(8);

    expect(texture.width).toBe(8);
    expect(texture.height).toBe(1);
  });

  test('identityLut3D builds an N²×N texture with default size 17', () => {
    const texture = LutFilter.identityLut3D();

    expect(texture.width).toBe(17 * 17);
    expect(texture.height).toBe(17);
  });

  test('identityLut3D accepts a custom size', () => {
    const texture = LutFilter.identityLut3D(4);

    expect(texture.width).toBe(16);
    expect(texture.height).toBe(4);
  });

  test('fromImage wraps an image/canvas source with LUT sampler defaults', () => {
    const canvas = document.createElement('canvas');

    canvas.width = 17 * 17;
    canvas.height = 17;

    const texture = LutFilter.fromImage(canvas);

    expect(texture).toBeInstanceOf(Texture);
    expect(texture.source).toBe(canvas);
  });

  test('identityLut1D throws a clear error when no 2D context is available', () => {
    getContextSpy.mockImplementationOnce(() => null);

    expect(() => LutFilter.identityLut1D()).toThrow('LutFilter.identityLut1D: 2D canvas context unavailable.');
  });

  test('identityLut3D throws a clear error when no 2D context is available', () => {
    getContextSpy.mockImplementationOnce(() => null);

    expect(() => LutFilter.identityLut3D()).toThrow('LutFilter.identityLut3D: 2D canvas context unavailable.');
  });
});

describe('LutFilter construction and options', () => {
  test('defaults to 3D mode with size 17', () => {
    const filter = new LutFilter();

    expect(filter.mode).toBe('3d');
    expect(filter.size).toBe(17);
    expect(filter.lut.width).toBe(17 * 17);
    expect(filter.lut.height).toBe(17);
  });

  test('1d mode builds a 1D identity LUT', () => {
    const filter = new LutFilter({ mode: '1d' });

    expect(filter.mode).toBe('1d');
    expect(filter.lut.width).toBe(256);
    expect(filter.lut.height).toBe(1);
  });

  test('a fractional size is floored', () => {
    const filter = new LutFilter({ mode: '3d', size: 8.9 });

    expect(filter.size).toBe(8);
  });

  test('a size below 2 is clamped up to 2', () => {
    const filter = new LutFilter({ mode: '3d', size: 1 });

    expect(filter.size).toBe(2);
  });
});

describe('LutFilter.setLut', () => {
  test('replaces the LUT texture before any backend filter exists', () => {
    const filter = new LutFilter();
    const custom = LutFilter.identityLut3D(5);

    const result = filter.setLut(custom);

    expect(result).toBe(filter);
    expect(filter.lut).toBe(custom);
  });

  test('also updates the live backend filter uniform once one has been created', () => {
    const filter = new LutFilter({ mode: '3d' });
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const replacement = LutFilter.identityLut3D(9);

    filter.setLut(replacement);

    const backendFilter = (filter as unknown as { _backendFilter: WebGl2ShaderFilter })._backendFilter;

    expect(backendFilter.uniforms['uLut']).toBe(replacement);

    filter.destroy();
    input.destroy();
    output.destroy();
  });
});

describe('LutFilter.apply — backend selection', () => {
  test('builds a WebGl2ShaderFilter on the WebGL2 backend for 3D mode', () => {
    const filter = new LutFilter({ mode: '3d', size: 5 });
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const backendFilter = (filter as unknown as { _backendFilter: unknown })._backendFilter;

    expect(backendFilter).toBeInstanceOf(WebGl2ShaderFilter);
    expect((backendFilter as WebGl2ShaderFilter).uniforms['uLutSize']).toBe(5);

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  test('builds a WebGl2ShaderFilter on the WebGL2 backend for 1D mode (no uLutSize uniform)', () => {
    const filter = new LutFilter({ mode: '1d' });
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);

    const backendFilter = (filter as unknown as { _backendFilter: WebGl2ShaderFilter })._backendFilter;

    expect(backendFilter).toBeInstanceOf(WebGl2ShaderFilter);
    expect(backendFilter.uniforms['uLutSize']).toBeUndefined();

    filter.destroy();
    input.destroy();
    output.destroy();
  });

  test('builds a WebGpuShaderFilter on the WebGPU backend for 3D mode', () => {
    const env = makeWebGpuEnv();

    try {
      const filter = new LutFilter({ mode: '3d', size: 9 });
      const backend = makeWebGpuBackend(env.device);
      const input = new RenderTexture(16, 16);
      const output = new RenderTexture(16, 16);

      filter.apply(backend, input, output);

      const backendFilter = (filter as unknown as { _backendFilter: unknown })._backendFilter;

      expect(backendFilter).toBeInstanceOf(WebGpuShaderFilter);
      expect((backendFilter as WebGpuShaderFilter).uniforms['uLutSize']).toBe(9);

      filter.destroy();
      input.destroy();
      output.destroy();
    } finally {
      env.restore();
    }
  });

  test('builds a WebGpuShaderFilter on the WebGPU backend for 1D mode', () => {
    const env = makeWebGpuEnv();

    try {
      const filter = new LutFilter({ mode: '1d' });
      const backend = makeWebGpuBackend(env.device);
      const input = new RenderTexture(16, 16);
      const output = new RenderTexture(16, 16);

      filter.apply(backend, input, output);

      const backendFilter = (filter as unknown as { _backendFilter: unknown })._backendFilter;

      expect(backendFilter).toBeInstanceOf(WebGpuShaderFilter);

      filter.destroy();
      input.destroy();
      output.destroy();
    } finally {
      env.restore();
    }
  });

  test('reuses the already-built backend filter on a second apply()', () => {
    const filter = new LutFilter();
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);
    const first = (filter as unknown as { _backendFilter: unknown })._backendFilter;

    filter.apply(backend, input, output);
    const second = (filter as unknown as { _backendFilter: unknown })._backendFilter;

    expect(second).toBe(first);

    filter.destroy();
    input.destroy();
    output.destroy();
  });
});

describe('LutFilter.destroy', () => {
  test('is a no-op when no backend filter was ever built', () => {
    const filter = new LutFilter();

    expect(() => filter.destroy()).not.toThrow();
  });

  test('releases the backend filter and clears the reference', () => {
    const filter = new LutFilter();
    const backend = makeWebGl2Backend();
    const input = new RenderTexture(16, 16);
    const output = new RenderTexture(16, 16);

    filter.apply(backend, input, output);
    const backendFilter = (filter as unknown as { _backendFilter: WebGl2ShaderFilter })._backendFilter;
    const destroySpy = vi.spyOn(backendFilter, 'destroy');

    filter.destroy();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect((filter as unknown as { _backendFilter: unknown })._backendFilter).toBeNull();

    input.destroy();
    output.destroy();
  });
});
