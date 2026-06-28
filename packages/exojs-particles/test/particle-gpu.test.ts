/// <reference types="@webgpu/types" />

import { Color, Rectangle, Texture, Time } from '@codexo/exojs';
import { WebGpuBackend } from '@codexo/exojs/renderer-sdk';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Curve } from '../src/distributions/Curve';
import { ApplyForce } from '../src/modules/ApplyForce';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { Drag } from '../src/modules/Drag';
import { RotateOverLifetime } from '../src/modules/RotateOverLifetime';
import { ScaleOverLifetime } from '../src/modules/ScaleOverLifetime';
import { UpdateModule } from '../src/modules/UpdateModule';
import { ParticleSystem } from '../src/ParticleSystem';

const makeTexture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  return new Texture(canvas);
};

const tick = (s: number): Time => Time.zero.clone().set(s * 1000);

interface MockComputePass {
  setPipeline: MockInstance;
  setBindGroup: MockInstance;
  dispatchWorkgroups: MockInstance;
  end: MockInstance;
}

interface MockEncoder {
  beginComputePass: MockInstance;
  finish: MockInstance;
}

const installGlobals = (): (() => void) => {
  const previous = {
    bufferUsage: Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage'),
    shaderStage: Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage'),
    textureUsage: Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage'),
  };

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    configurable: true,
    value: {
      COPY_DST: 1,
      INDEX: 2,
      UNIFORM: 4,
      VERTEX: 8,
      STORAGE: 16,
      COPY_SRC: 32,
      MAP_READ: 64,
      MAP_WRITE: 128,
    },
  });
  Object.defineProperty(globalThis, 'GPUShaderStage', {
    configurable: true,
    value: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
  });
  Object.defineProperty(globalThis, 'GPUTextureUsage', {
    configurable: true,
    value: { COPY_DST: 1, TEXTURE_BINDING: 2, STORAGE_BINDING: 4, RENDER_ATTACHMENT: 8 },
  });

  return () => {
    if (previous.bufferUsage) Object.defineProperty(globalThis, 'GPUBufferUsage', previous.bufferUsage);
    else delete (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage;
    if (previous.shaderStage) Object.defineProperty(globalThis, 'GPUShaderStage', previous.shaderStage);
    else delete (globalThis as { GPUShaderStage?: unknown }).GPUShaderStage;
    if (previous.textureUsage) Object.defineProperty(globalThis, 'GPUTextureUsage', previous.textureUsage);
    else delete (globalThis as { GPUTextureUsage?: unknown }).GPUTextureUsage;
  };
};

const makeMockDevice = () => {
  const buffers: { destroy: MockInstance }[] = [];
  const textures: { destroy: MockInstance; createView: MockInstance }[] = [];
  const pass: MockComputePass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const encoder: MockEncoder = {
    beginComputePass: vi.fn(() => pass),
    finish: vi.fn(() => ({ label: 'cb' }) as unknown as GPUCommandBuffer),
  };
  const queue = {
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  const computePipelineDescriptors: GPUComputePipelineDescriptor[] = [];
  const shaderSources: string[] = [];
  const createShaderModule = vi.fn((descriptor: GPUShaderModuleDescriptor) => {
    shaderSources.push(descriptor.code);
    return {} as GPUShaderModule;
  });
  const createComputePipeline = vi.fn((descriptor: GPUComputePipelineDescriptor) => {
    computePipelineDescriptors.push(descriptor);
    return {} as GPUComputePipeline;
  });
  const device = {
    createShaderModule,
    createBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
    createPipelineLayout: vi.fn(() => ({}) as GPUPipelineLayout),
    createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    createComputePipeline,
    createCommandEncoder: vi.fn(() => encoder as unknown as GPUCommandEncoder),
    createBuffer: vi.fn(() => {
      const buffer = { destroy: vi.fn() };
      buffers.push(buffer);
      return buffer as unknown as GPUBuffer;
    }),
    createTexture: vi.fn(() => {
      const texture = {
        destroy: vi.fn(),
        createView: vi.fn(() => ({}) as GPUTextureView),
      };
      textures.push(texture);
      return texture as unknown as GPUTexture;
    }),
    createSampler: vi.fn(() => ({}) as GPUSampler),
    queue,
  } as unknown as GPUDevice;

  return { device, encoder, pass, queue, buffers, textures, computePipelineDescriptors, shaderSources };
};

describe('ParticleSystem GPU mode — auto-routing', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('CPU mode (no device passed) — first update does not allocate GPU resources', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64 });

    system.addUpdateModule(new ApplyForce(0, 100));

    const slot = system.spawn();
    system.lifetime[slot] = 10;

    system.update(tick(0.1));

    expect(system.gpuMode).toBe(false);
    expect(system.gpuState).toBeNull();
    expect(env.device.createComputePipeline).not.toHaveBeenCalled();
  });

  test('GPU mode (device passed, all modules WGSL-eligible) — compiles compute pipeline at first update', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 256, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 980));
    system.addUpdateModule(new Drag(0.5));
    system.addUpdateModule(new RotateOverLifetime(360));

    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.scaleX[slot] = 1;
    system.scaleY[slot] = 1;

    expect(system.gpuMode).toBe(false);
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);

    expect(env.device.createComputePipeline).toHaveBeenCalledTimes(1);
    expect(env.shaderSources.length).toBe(1);
    expect(env.shaderSources[0]).toContain('@compute');
    expect(env.shaderSources[0]).toContain('workgroup_size(64)');
    expect(env.shaderSources[0]).toContain('u_ApplyForce');
    expect(env.shaderSources[0]).toContain('u_Drag');
    expect(env.shaderSources[0]).toContain('u_RotateOverLifetime');
  });

  test('Custom CPU-only module forces CPU mode even when device is passed', () => {
    class CpuOnly extends UpdateModule {
      apply() {
        /* no-op */
      }
    }

    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));
    system.addUpdateModule(new CpuOnly());

    const slot = system.spawn();
    system.lifetime[slot] = 10;

    system.update(tick(0.016));

    expect(system.gpuMode).toBe(false);
    expect(env.device.createComputePipeline).not.toHaveBeenCalled();
  });

  test('Curve / ColorGradient modules trigger texture allocation in GPU mode', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 256, device: env.device });

    system.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );
    system.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 0, 0, 1) },
          { t: 1, color: new Color(0, 0, 0, 0) },
        ]),
      ),
    );

    const slot = system.spawn();
    system.lifetime[slot] = 10;

    system.update(tick(0.016));

    expect(env.device.createTexture).toHaveBeenCalledTimes(2);
    expect(env.queue.writeTexture).toHaveBeenCalledTimes(2);
  });

  test('GPU mode dispatches compute on every update with non-zero liveCount', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));

    const slot = system.spawn();
    system.lifetime[slot] = 10;

    system.update(tick(0.016));

    expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(1);
    expect(env.pass.setPipeline).toHaveBeenCalled();
    expect(env.pass.setBindGroup).toHaveBeenCalledTimes(2);
    expect(env.pass.dispatchWorkgroups).toHaveBeenCalledWith(1);

    system.update(tick(0.016));
    expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(2);
  });

  test('Adding update modules after compile throws', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));
    system.spawn();
    system.update(tick(0.016));

    expect(() => system.addUpdateModule(new Drag(0.5))).toThrow(/after the system has been compiled/);
  });

  test('destroy releases GPU resources', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));
    system.spawn();
    system.update(tick(0.016));

    const buffersBefore = env.buffers.length;
    const texturesBefore = env.textures.length;

    system.destroy();

    expect(env.buffers.slice(0, buffersBefore).every(b => b.destroy.mock.calls.length > 0)).toBe(true);
    expect(env.textures.length).toBe(texturesBefore);
  });
});

describe('ParticleSystem alive-flag in GPU mode', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('spawn finds first dead slot via round-robin hint', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    const a = system.spawn();
    const b = system.spawn();
    const c = system.spawn();

    expect(a).toBe(0);
    expect(b).toBe(1);
    expect(c).toBe(2);

    system.alive[b] = 0;
    const d = system.spawn();
    expect(d).toBe(3);

    system.alive[3] = 0;
    const e = system.spawn();
    expect([1, 3].includes(e)).toBe(true);
  });

  test('expired particle in GPU mode sets lifetime=-1 sentinel + alive=0', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    const slot = system.spawn();
    system.lifetime[slot] = 0.05;

    system.update(tick(0.1));

    expect(system.alive[slot]).toBe(0);
    expect(system.lifetime[slot]).toBe(-1);
    expect(system.aliveCount).toBe(0);
  });
});

describe('ParticleSystem texture configuration', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('omitted texture falls back to a 1×1 white default', () => {
    const system = new ParticleSystem({ capacity: 4 });

    expect(system.texture).toBeDefined();
    expect(system.texture.width).toBe(1);
    expect(system.texture.height).toBe(1);
    expect(system.frames.length).toBe(0);
    expect(system.hasAtlas).toBe(false);
  });

  test('frames option declares an atlas; hasAtlas reflects multi-frame', () => {
    const tex = makeTexture();
    const frames = [new Rectangle(0, 0, 8, 8), new Rectangle(8, 0, 8, 8), new Rectangle(0, 8, 8, 8)];
    const system = new ParticleSystem(tex, frames, { capacity: 4 });

    expect(system.frames.length).toBe(3);
    expect(system.hasAtlas).toBe(true);
    frames[0].set(99, 99, 99, 99);
    expect(system.frames[0].x).toBe(0);
  });
});

describe('ParticleSystem render-inject backend detection', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('render(backend) captures the backend; next update compiles GPU when backend is WebGpuBackend', () => {
    const env = makeMockDevice();
    const fakeBackend = Object.create(WebGpuBackend.prototype) as object;
    Object.defineProperty(fakeBackend, 'device', { value: env.device, configurable: true });
    // Frame-scoped batching uses these instance stacks in _beginDrawPlan/_endDrawPlan;
    // Object.create bypasses the constructor that initializes them, so seed them here.
    Object.defineProperty(fakeBackend, '_planBaseStack', { value: [], configurable: true });
    Object.defineProperty(fakeBackend, '_planHashStack', { value: [], configurable: true });

    const system = new ParticleSystem(makeTexture(), { capacity: 4 });
    system.addUpdateModule(new ApplyForce(0, 0));

    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(false);

    system.visible = false;
    system.render(fakeBackend as unknown as Parameters<typeof system.render>[0]);

    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);
  });
});
