/// <reference types="@webgpu/types" />

import { Color, Rectangle, Texture, Time } from '@codexo/exojs';
import type { RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';
import { WebGpuBackend } from '@codexo/exojs/renderer-sdk';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Constant } from '../src/distributions/Constant';
import { Curve } from '../src/distributions/Curve';
import { ParticleGpuState } from '../src/gpu/ParticleGpuState';
import { ApplyForce } from '../src/modules/ApplyForce';
import { BurstSpawn } from '../src/modules/BurstSpawn';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { Drag } from '../src/modules/Drag';
import { RotateOverLifetime } from '../src/modules/RotateOverLifetime';
import { ScaleOverLifetime } from '../src/modules/ScaleOverLifetime';
import { SpawnOnDeath } from '../src/modules/SpawnOnDeath';
import { Turbulence } from '../src/modules/Turbulence';
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

/** Finds the mock GPUBuffer created with a given `label`, by call order. */
const findBufferByLabel = (env: ReturnType<typeof makeMockDevice>, label: string): { destroy: MockInstance } => {
  const calls = (env.device.createBuffer as unknown as MockInstance).mock.calls as [GPUBufferDescriptor][];
  const index = calls.findIndex(([descriptor]) => descriptor.label === label);

  if (index === -1) throw new Error(`No buffer created with label "${label}"`);

  return env.buffers[index]!;
};

const makeBuilder = (device: GPUDevice | null): RenderPlanBuilder => ({ backend: { device } }) as unknown as RenderPlanBuilder;

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

describe('ParticleSystem._collect backend-change detection', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('re-collecting on the same backend is a no-op; a changed backend tears down GPU state', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4 });

    // visible=false makes the inherited RenderNode._collect() return
    // immediately after ParticleSystem's own backend-tracking logic runs,
    // so we can drive `_collect` directly without a full render-plan builder.
    system.visible = false;
    system.addUpdateModule(new ApplyForce(0, 0));

    const builderA = makeBuilder(env.device);

    system._collect(builderA);
    expect(system.gpuState).toBeNull();

    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);

    const gpuStateAfterCompile = system.gpuState;
    expect(gpuStateAfterCompile).not.toBeNull();

    // Same backend reference again — must not touch the existing GPU state.
    system._collect(builderA);
    expect(system.gpuState).toBe(gpuStateAfterCompile);

    // A different backend forces a teardown of the existing GPU state.
    const env2 = makeMockDevice();
    const builderB = makeBuilder(env2.device);

    system._collect(builderB);
    expect(system.gpuState).toBeNull();
  });
});

describe('ParticleSystem._compile pre-existing dead slots', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('slots killed directly (not via natural expiry) before the first update are not marked dirty at compile time', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    // Two slots spawned in dense CPU fashion before any update() call (the
    // system is still in CPU mode at this point — _compile() hasn't run).
    const a = system.spawn();
    const b = system.spawn();

    system.lifetime[a] = 10;
    system.lifetime[b] = 10;
    // Kill slot b directly, bypassing recycling — it's still within
    // [0, liveCount) when _compile() runs on the first update().
    system.alive[b] = 0;

    system.addUpdateModule(new ApplyForce(0, 0));
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);

    const positionsBuffer = findBufferByLabel(env, 'particle-positions');
    const offsets = (env.queue.writeBuffer as unknown as MockInstance).mock.calls
      .filter(([buffer]) => buffer === positionsBuffer)
      .map(([, offset]) => offset);

    // Slot a (alive) is uploaded at byte offset 0; slot b (dead pre-compile)
    // must be skipped, so its byte offset (8) never appears.
    expect(offsets).toContain(0);
    expect(offsets).not.toContain(8);
  });
});

describe('ParticleSystem._spawnGpu wrap-around search', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('wraps past the hint to find a dead slot below it, skipping still-alive slots along the way', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // Fill all 4 slots — the round-robin hint wraps back to 0.
    const a = system.spawn();
    const b = system.spawn();
    const c = system.spawn();
    const d = system.spawn();

    expect([a, b, c, d]).toEqual([0, 1, 2, 3]);

    // Free slot 2 — found by the forward-scan first loop, hint becomes 3.
    system.alive[2] = 0;
    expect(system.spawn()).toBe(2);

    // Free slot 1 (but leave slot 0 alive). The forward-scan loop
    // (hint(3)..capacity-1) finds nothing since slot 3 is still alive, so
    // the wrap-around loop (0..hint) must run: it skips over still-alive
    // slot 0 before finding dead slot 1.
    system.alive[1] = 0;
    expect(system.spawn()).toBe(1);
  });

  test('returns -1 once every slot is alive and no gap exists to wrap into', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 2, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    expect(system.spawn()).toBe(0);
    expect(system.spawn()).toBe(1);
    expect(system.spawn()).toBe(-1);
  });
});

describe('ParticleSystem._updateGpu dead-slot skipping', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('slots killed directly within the live range are skipped by the elapsed-increment loop', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    const a = system.spawn();
    const b = system.spawn();

    system.lifetime[a] = 10;
    system.lifetime[b] = 10;
    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // Kill b directly — not via natural expiry — while it's still within
    // [0, liveCount).
    system.alive[b] = 0;
    system.update(tick(0.1));

    expect(system.elapsed[a]).toBeCloseTo(0.1);
    // b was skipped by the `if (alive[i] === 0) continue;` guard, so its
    // elapsed time is untouched.
    expect(system.elapsed[b]).toBe(0);
  });
});

describe('ParticleSystem GPU mode — natural expiry death modules', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('fires death modules when a particle expires naturally (elapsed >= lifetime) in GPU mode', () => {
    const env = makeMockDevice();
    const parent = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });
    const child = new ParticleSystem(makeTexture(), { capacity: 4 });

    parent.addUpdateModule(new ApplyForce(0, 0));
    parent.addDeathModule(new SpawnOnDeath(child, new BurstSpawn({ schedule: [{ time: 0, count: 1 }], lifetime: new Constant(5) })));

    const slot = parent.spawn();
    parent.lifetime[slot] = 0.05;

    parent.update(tick(0));
    expect(parent.gpuMode).toBe(true);

    // elapsed (integrated in _updateGpu) reaches 0.1 >= lifetime 0.05 -> natural expiry.
    parent.update(tick(0.1));

    expect(parent.alive[slot]).toBe(0);
    expect(parent.lifetime[slot]).toBe(-1);
    expect(child.liveCount).toBe(1);
  });
});

describe('ParticleGpuState direct construction', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('throws if a registered module lacks wgsl(), bypassing ParticleSystem\'s own eligibility guard', () => {
    const env = makeMockDevice();

    class NoWgslModule extends UpdateModule {
      public override apply(): void {
        /* no-op */
      }
    }

    expect(() => new ParticleGpuState(env.device, 4, [new NoWgslModule()], [], makeTexture())).toThrow(/has no wgsl/);
  });

  test('uploadTextures loop tolerates a module that implements uploadTextures() without declaring any wgsl() textures', () => {
    const env = makeMockDevice();

    let uploadCalls = 0;

    class UploaderWithoutTextures extends UpdateModule {
      public override apply(): void {
        /* no-op */
      }

      public override wgsl() {
        return { key: 'NoTex', body: '// noop' };
      }

      public override uploadTextures(_device: GPUDevice, textures: ReadonlyMap<string, GPUTexture>): void {
        uploadCalls++;
        expect(textures.size).toBe(0);
      }
    }

    expect(() => new ParticleGpuState(env.device, 4, [new UploaderWithoutTextures()], [], makeTexture())).not.toThrow();
    expect(uploadCalls).toBe(1);
  });

  test('destroy() releases every module-owned lookup texture', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);
    expect(env.textures.length).toBeGreaterThan(0);

    system.destroy();

    expect(env.textures.every(t => t.destroy.mock.calls.length > 0)).toBe(true);
  });
});

describe('ParticleGpuState frame-UV packing (_writeFrames)', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  const readFramesUniforms = (env: ReturnType<typeof makeMockDevice>): Float32Array => {
    const framesBuffer = findBufferByLabel(env, 'particle-frames-uniforms');
    const call = (env.queue.writeBuffer as unknown as MockInstance).mock.calls.find(([buffer]) => buffer === framesBuffer);

    if (!call) throw new Error('frames uniform buffer was never written');

    return new Float32Array(call[2] as ArrayBuffer);
  };

  test('atlas frames (non-flipped) pack per-frame UV bounds via the loop path', () => {
    const env = makeMockDevice();
    const tex = makeTexture(); // 16x16
    const frames = [new Rectangle(0, 0, 8, 8), new Rectangle(8, 0, 8, 8)];
    const system = new ParticleSystem(tex, frames, { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);

    const view = readFramesUniforms(env);

    // Frame 0: (0,0)-(8,8) on a 16x16 texture -> UV (0,0)-(0.5,0.5).
    expect(view[0]).toBeCloseTo(0);
    expect(view[1]).toBeCloseTo(0);
    expect(view[2]).toBeCloseTo(0.5);
    expect(view[3]).toBeCloseTo(0.5);
    // Frame 1: (8,0)-(16,8) -> UV (0.5,0)-(1,0.5).
    expect(view[4]).toBeCloseTo(0.5);
    expect(view[5]).toBeCloseTo(0);
    expect(view[6]).toBeCloseTo(1);
    expect(view[7]).toBeCloseTo(0.5);
  });

  test('atlas frames on a flipY texture swap the V bounds via the loop path', () => {
    const env = makeMockDevice();
    const tex = makeTexture();
    tex.flipY = true;
    const frames = [new Rectangle(0, 0, 8, 8)];
    const system = new ParticleSystem(tex, frames, { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));

    const view = readFramesUniforms(env);

    // flipY swaps topV/bottomV: minV becomes bottomV(0), maxV becomes topV(0.5).
    expect(view[1]).toBeCloseTo(0.5);
    expect(view[3]).toBeCloseTo(0);
  });

  test('flipY texture without an atlas packs the single-frame fallback with V bounds swapped', () => {
    const env = makeMockDevice();
    const tex = makeTexture();
    tex.flipY = true;
    const system = new ParticleSystem(tex, { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));

    const view = readFramesUniforms(env);

    expect(view[0]).toBe(0);
    expect(view[1]).toBe(1);
    expect(view[2]).toBe(1);
    expect(view[3]).toBe(0);
  });
});

describe('ParticleGpuState prelude deduplication', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('two modules sharing a wgsl() key emit the prelude helper block only once', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    // Two Turbulence instances share the same wgsl() `key` ("Turbulence") —
    // documented as unsupported ("Two ApplyForce instances on one system
    // aren't supported — combine into one", WgslContribution.key) but not
    // rejected at runtime. This is the only way to reach the prelude
    // deduplication branch, so we use it purely to exercise that path.
    system.addUpdateModule(new Turbulence(50));
    system.addUpdateModule(new Turbulence(30));

    const slot = system.spawn();
    system.lifetime[slot] = 10;
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);

    const shaderSource = env.shaderSources[0]!;
    const preludeOccurrences = shaderSource.match(/fn exojs_turbulence_hash21/g) ?? [];

    expect(preludeOccurrences.length).toBe(1);
  });
});

describe('UpdateModule.uploadTextures — missing map entry', () => {
  test('ColorOverLifetime.uploadTextures no-ops when the gradient texture is absent from the map', () => {
    const module = new ColorOverLifetime(
      new ColorGradient([
        { t: 0, color: new Color(0, 0, 0, 1) },
        { t: 1, color: new Color(255, 255, 255, 1) },
      ]),
    );

    expect(() => module.uploadTextures({} as GPUDevice, new Map())).not.toThrow();
  });

  test('ScaleOverLifetime.uploadTextures no-ops when the curve texture is absent from the map', () => {
    const module = new ScaleOverLifetime(
      new Curve([
        { t: 0, v: 1 },
        { t: 1, v: 0 },
      ]),
    );

    expect(() => module.uploadTextures({} as GPUDevice, new Map())).not.toThrow();
  });
});
