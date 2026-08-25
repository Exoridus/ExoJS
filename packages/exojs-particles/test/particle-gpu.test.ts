/// <reference types="@webgpu/types" />

import { Color, logger, Rectangle, Texture, Time } from '@codexo/exojs';
import type { RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';
import { WebGpuBackend } from '@codexo/exojs/renderer-sdk';
import type { MockInstance } from 'vitest';

import { ColorGradient } from '../src/distributions/ColorGradient';
import { Constant } from '../src/distributions/Constant';
import { Curve } from '../src/distributions/Curve';
import { ParticleGpuState } from '../src/gpu/ParticleGpuState';
import { ApplyForce } from '../src/modules/ApplyForce';
import { BurstSpawn } from '../src/modules/BurstSpawn';
import { ColorOverLifetime } from '../src/modules/ColorOverLifetime';
import { DeathModule } from '../src/modules/DeathModule';
import { Drag } from '../src/modules/Drag';
import { RotateOverLifetime } from '../src/modules/RotateOverLifetime';
import { ScaleOverLifetime } from '../src/modules/ScaleOverLifetime';
import { SpawnOnDeath } from '../src/modules/SpawnOnDeath';
import { Turbulence } from '../src/modules/Turbulence';
import { UpdateModule } from '../src/modules/UpdateModule';
import type { ParticleDeathContext } from '../src/ParticleStorage';
import { ParticleSystem } from '../src/ParticleSystem';
import { QuadParticles } from '../src/renderModes/QuadParticles';

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
  copyBufferToBuffer: MockInstance;
  finish: MockInstance;
}

const installGlobals = (): (() => void) => {
  const previous = {
    bufferUsage: Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage'),
    shaderStage: Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage'),
    textureUsage: Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage'),
    mapMode: Object.getOwnPropertyDescriptor(globalThis, 'GPUMapMode'),
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
  Object.defineProperty(globalThis, 'GPUMapMode', {
    configurable: true,
    value: { READ: 1, WRITE: 2 },
  });

  return () => {
    if (previous.mapMode) Object.defineProperty(globalThis, 'GPUMapMode', previous.mapMode);
    else Reflect.deleteProperty(globalThis, 'GPUMapMode');
    if (previous.bufferUsage) Object.defineProperty(globalThis, 'GPUBufferUsage', previous.bufferUsage);
    else delete (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage;
    if (previous.shaderStage) Object.defineProperty(globalThis, 'GPUShaderStage', previous.shaderStage);
    else delete (globalThis as { GPUShaderStage?: unknown }).GPUShaderStage;
    if (previous.textureUsage) Object.defineProperty(globalThis, 'GPUTextureUsage', previous.textureUsage);
    else delete (globalThis as { GPUTextureUsage?: unknown }).GPUTextureUsage;
  };
};

interface MockBuffer {
  destroy: MockInstance;
  bytes: ArrayBuffer;
  mapAsync: MockInstance;
  getMappedRange: MockInstance;
  unmap: MockInstance;
}

const makeMockDevice = () => {
  const buffers: MockBuffer[] = [];
  const textures: { destroy: MockInstance; createView: MockInstance }[] = [];
  const pass: MockComputePass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  };
  const copies: { source: unknown; sourceOffset: number; destination: MockBuffer; size: number }[] = [];
  const encoder: MockEncoder = {
    beginComputePass: vi.fn(() => pass),
    copyBufferToBuffer: vi.fn((source: unknown, sourceOffset: number, destination: MockBuffer, _destinationOffset: number, size: number) => {
      copies.push({ source, sourceOffset, destination, size });
    }),
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
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      // A mapped range is backed by real bytes so a test can stage death
      // records into it exactly as the compute shader would.
      const bytes = new ArrayBuffer(descriptor.size);
      const buffer: MockBuffer = {
        destroy: vi.fn(),
        bytes,
        mapAsync: vi.fn(async () => undefined),
        getMappedRange: vi.fn((offset = 0, size = descriptor.size) => bytes.slice(offset, offset + size)),
        unmap: vi.fn(),
      };
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

  return { device, encoder, pass, queue, buffers, textures, copies, computePipelineDescriptors, shaderSources };
};

/** Finds every mock GPUBuffer created with a given `label`, in creation order. */
const findBuffersByLabel = (env: ReturnType<typeof makeMockDevice>, label: string): MockBuffer[] => {
  const calls = (env.device.createBuffer as unknown as MockInstance).mock.calls as [GPUBufferDescriptor][];

  return calls.flatMap(([descriptor], index) => (descriptor.label === label ? [env.buffers[index]!] : []));
};

/** Finds the mock GPUBuffer created with a given `label`, by call order. */
const findBufferByLabel = (env: ReturnType<typeof makeMockDevice>, label: string): MockBuffer => {
  const [first] = findBuffersByLabel(env, label);

  if (first === undefined) throw new Error(`No buffer created with label "${label}"`);

  return first;
};

/**
 * Keeps every death readback pending until released, so a test can hold the
 * staging ring occupied the way a device that maps slower than a frame does.
 */
const holdDeathMaps = (env: ReturnType<typeof makeMockDevice>): { release: (index?: number) => void } => {
  const waiting: (() => void)[] = [];
  const create = env.device.createBuffer as unknown as MockInstance;
  const inner = create.getMockImplementation()!;

  create.mockImplementation((descriptor: GPUBufferDescriptor) => {
    const buffer = inner(descriptor) as MockBuffer;

    if (descriptor.label === 'particle-deaths-staging') {
      buffer.mapAsync = vi.fn(() => new Promise<undefined>(resolve => waiting.push(() => resolve(undefined))));
    }

    return buffer;
  });

  return {
    release: (index = 0) => waiting.splice(index, 1)[0]?.(),
  };
};

interface StagedDeath {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  elapsed: number;
  color: number;
  slot: number;
}

/**
 * Writes death records into the staging buffer the readback maps, in the
 * 40-byte layout the compute shader appends.
 */
const stageDeathRecords = (env: ReturnType<typeof makeMockDevice>, records: readonly StagedDeath[], slot = 0): void => {
  const staging = findBuffersByLabel(env, 'particle-deaths-staging')[slot]!;
  const floats = new Float32Array(staging.bytes);
  const uints = new Uint32Array(staging.bytes);

  records.forEach((record, index) => {
    const base = index * 10;

    floats[base + 0] = record.x;
    floats[base + 1] = record.y;
    floats[base + 2] = record.velocityX;
    floats[base + 3] = record.velocityY;
    floats[base + 4] = record.rotation;
    floats[base + 5] = record.scaleX;
    floats[base + 6] = record.scaleY;
    floats[base + 7] = record.elapsed;
    uints[base + 8] = record.color;
    uints[base + 9] = record.slot;
  });
};

/** Lets the readback promise chain settle. */
const flushDeathReadback = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;

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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
    system._storage.scaleX[slot] = 1;
    system._storage.scaleY[slot] = 1;

    expect(system.gpuMode).toBe(false);
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);

    expect(env.device.createComputePipeline).toHaveBeenCalledTimes(1);
    expect(env.shaderSources.length).toBe(1);
    // The simulate skeleton is a `.wgsl` file with three substituted holes; an
    // unresolved one would ship a literal `{{name}}` that WGSL cannot parse.
    expect(env.shaderSources[0]).toContain('@compute');
    expect(env.shaderSources[0]).toContain('workgroup_size(64)');
    expect(env.shaderSources[0]).toContain('rawFrameIndex < 1u');
    expect(env.shaderSources[0]).not.toContain('{{');
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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;

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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;

    system.update(tick(0.016));

    expect(env.device.createTexture).toHaveBeenCalledTimes(2);
    expect(env.queue.writeTexture).toHaveBeenCalledTimes(2);
  });

  test('GPU mode dispatches compute on every update with non-zero liveCount', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;

    system.update(tick(0.016));

    expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(1);
    expect(env.pass.setPipeline).toHaveBeenCalled();
    expect(env.pass.setBindGroup).toHaveBeenCalledTimes(2);
    expect(env.pass.dispatchWorkgroups).toHaveBeenCalledWith(1);

    system.update(tick(0.016));
    expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(2);
  });

  test('adding a GPU-eligible module rebuilds the program and keeps the particles', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));

    const particle = system.emit()!;

    particle.lifetime = 100;
    system.update(tick(0.016));

    const pipelinesBefore = env.computePipelineDescriptors.length;

    system.addUpdateModule(new Drag(0.5));
    system.update(tick(0.016));

    expect(env.computePipelineDescriptors.length).toBe(pipelinesBefore + 1);
    expect(system.gpuMode).toBe(true);
    expect(system.liveCount).toBe(1);
    // The simulation buffers survive a program swap, so the positions buffer is
    // still the one the device has been integrating into.
    expect(findBufferByLabel(env, 'particle-positions').destroy).not.toHaveBeenCalled();
  });

  test('a module without wgsl() moves the system to the CPU and clears the particles it cannot carry over', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));

    const particle = system.emit()!;

    particle.lifetime = 100;
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);

    class CpuOnly extends UpdateModule {
      public override apply(): void {}
    }

    system.addUpdateModule(new CpuOnly());
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(false);
    expect(system.liveCount).toBe(0);
    expect(findBufferByLabel(env, 'particle-positions').destroy).toHaveBeenCalled();
  });

  test('destroy releases GPU resources', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 100));
    system._spawnSlot();
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

    const a = system._spawnSlot();
    const b = system._spawnSlot();
    const c = system._spawnSlot();

    expect(a).toBe(0);
    expect(b).toBe(1);
    expect(c).toBe(2);

    system._storage.alive[b] = 0;
    const d = system._spawnSlot();
    expect(d).toBe(3);

    system._storage.alive[3] = 0;
    const e = system._spawnSlot();
    expect([1, 3].includes(e)).toBe(true);
  });

  test('expired particle in GPU mode sets lifetime=-1 sentinel + alive=0', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 0.05;

    system.update(tick(0.1));

    expect(system._storage.alive[slot]).toBe(0);
    expect(system._storage.lifetime[slot]).toBe(-1);
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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
    system.update(tick(0.016));
    expect(system.gpuMode).toBe(true);

    const gpuStateAfterCompile = system.gpuState;
    expect(gpuStateAfterCompile).not.toBeNull();

    // Same backend reference again - must not touch the existing GPU state.
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
    // system is still in CPU mode at this point - _compile() hasn't run).
    const a = system._spawnSlot();
    const b = system._spawnSlot();

    system._storage.lifetime[a] = 10;
    system._storage.lifetime[b] = 10;
    // Kill slot b directly, bypassing recycling - it's still within
    // [0, liveCount) when _compile() runs on the first update().
    system._storage.alive[b] = 0;

    system.addUpdateModule(new ApplyForce(0, 0));
    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);

    const positionsBuffer = findBufferByLabel(env, 'particle-positions');
    const offsets = (env.queue.writeBuffer as unknown as MockInstance).mock.calls.filter(([buffer]) => buffer === positionsBuffer).map(([, offset]) => offset);

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

    // Fill all 4 slots - the round-robin hint wraps back to 0.
    const a = system._spawnSlot();
    const b = system._spawnSlot();
    const c = system._spawnSlot();
    const d = system._spawnSlot();

    expect([a, b, c, d]).toEqual([0, 1, 2, 3]);

    // Free slot 2 - found by the forward-scan first loop, hint becomes 3.
    system._storage.alive[2] = 0;
    expect(system._spawnSlot()).toBe(2);

    // Free slot 1 (but leave slot 0 alive). The forward-scan loop
    // (hint(3)..capacity-1) finds nothing since slot 3 is still alive, so
    // the wrap-around loop (0..hint) must run: it skips over still-alive
    // slot 0 before finding dead slot 1.
    system._storage.alive[1] = 0;
    expect(system._spawnSlot()).toBe(1);
  });

  test('returns -1 once every slot is alive and no gap exists to wrap into', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 2, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));
    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    expect(system._spawnSlot()).toBe(0);
    expect(system._spawnSlot()).toBe(1);
    expect(system._spawnSlot()).toBe(-1);
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

    const a = system._spawnSlot();
    const b = system._spawnSlot();

    system._storage.lifetime[a] = 10;
    system._storage.lifetime[b] = 10;
    system.update(tick(0));
    expect(system.gpuMode).toBe(true);

    // Kill b directly - not via natural expiry - while it's still within
    // [0, liveCount).
    system._storage.alive[b] = 0;
    system.update(tick(0.1));

    expect(system._storage.elapsed[a]).toBeCloseTo(0.1);
    // b was skipped by the `if (alive[i] === 0) continue;` guard, so its
    // elapsed time is untouched.
    expect(system._storage.elapsed[b]).toBe(0);
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

  test('reports a GPU death from the readback, carrying what the device integrated', async () => {
    const env = makeMockDevice();
    const parent = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });
    const child = new ParticleSystem(makeTexture(), { capacity: 4 });
    const deaths: ParticleDeathContext[] = [];

    parent.addUpdateModule(new ApplyForce(0, 0));
    parent.addDeathModule(new SpawnOnDeath(child, new BurstSpawn({ schedule: [{ time: 0, count: 1 }], lifetime: new Constant(5) })));
    parent.addDeathModule(
      new (class extends DeathModule {
        public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
          deaths.push(death);
        }
      })(),
    );

    const particle = parent.emit()!;

    particle.lifetime = 0.05;
    parent.update(tick(0));
    expect(parent.gpuMode).toBe(true);

    // elapsed (integrated in _updateGpu) reaches 0.1 >= lifetime 0.05 -> natural expiry.
    parent.update(tick(0.1));

    expect(parent._storage.alive[0]).toBe(0);
    expect(parent._storage.lifetime[0]).toBe(-1);
    // Nothing is delivered from CPU storage: the record has to come back first.
    expect(deaths).toHaveLength(0);
    expect(child.liveCount).toBe(0);

    stageDeathRecords(env, [{ x: 120, y: -40, velocityX: 55, velocityY: 5, rotation: 0.5, scaleX: 2, scaleY: 3, color: 0xff00ff00, slot: 0, elapsed: 0.1 }]);
    await flushDeathReadback();

    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toMatchObject({ x: 120, y: -40, velocityX: 55, rotation: 0.5, scaleX: 2, scaleY: 3, color: 0xff00ff00 });
    // The lifetime comes from the CPU: the device only ever saw the sentinel.
    expect(deaths[0]!.lifetime).toBeCloseTo(0.05, 5);
    expect(child.liveCount).toBe(1);
    expect(child._storage.posX[0]).toBe(120);
    expect(child._storage.posY[0]).toBe(-40);
  });

  test('delivers several deaths from one readback in slot order, exactly once each', async () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 8, device: env.device });
    const slots: number[] = [];

    system.addUpdateModule(new ApplyForce(0, 0));
    system.addDeathModule(
      new (class extends DeathModule {
        public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
          slots.push(death.x);
        }
      })(),
    );

    for (let i = 0; i < 3; i++) {
      const particle = system.emit()!;

      particle.lifetime = 0.05;
    }

    system.update(tick(0));
    system.update(tick(0.1));

    // Appended in whatever order the workgroups finished.
    stageDeathRecords(env, [
      { x: 2, y: 0, velocityX: 0, velocityY: 0, rotation: 0, scaleX: 1, scaleY: 1, color: 0, slot: 2, elapsed: 0.1 },
      { x: 0, y: 0, velocityX: 0, velocityY: 0, rotation: 0, scaleX: 1, scaleY: 1, color: 0, slot: 0, elapsed: 0.1 },
      { x: 1, y: 0, velocityX: 0, velocityY: 0, rotation: 0, scaleX: 1, scaleY: 1, color: 0, slot: 1, elapsed: 0.1 },
    ]);
    await flushDeathReadback();

    expect(slots).toEqual([0, 1, 2]);

    // A further frame re-visits the dead slots without reporting them again.
    system.update(tick(0.016));
    await flushDeathReadback();

    expect(slots).toEqual([0, 1, 2]);
  });

  test('deaths reported while every staging slot is in flight reach a later readback', async () => {
    const env = makeMockDevice();
    const maps = holdDeathMaps(env);
    const system = new ParticleSystem(makeTexture(), { capacity: 8, device: env.device });
    const slots: number[] = [];

    system.addUpdateModule(new ApplyForce(0, 0));
    system.addDeathModule(
      new (class extends DeathModule {
        public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
          slots.push(death.x);
        }
      })(),
    );

    // One particle expires per step, so every step reports a death.
    for (let i = 0; i < 5; i++) {
      const particle = system.emit()!;

      particle.lifetime = 0.02 * (i + 1);
    }

    system.update(tick(0));

    for (let i = 0; i < 5; i++) {
      system.update(tick(0.02));
      await flushDeathReadback();
    }

    const deathBuffer = findBufferByLabel(env, 'particle-deaths');
    const resets = (env.queue.writeBuffer as unknown as MockInstance).mock.calls.filter(call => call[0] === deathBuffer);

    // Three slots take a copy each; the last two steps find the ring occupied.
    expect(findBuffersByLabel(env, 'particle-deaths-staging')).toHaveLength(3);
    expect(env.copies).toHaveLength(3);
    // The append counter is reset by every step that starts with an empty
    // buffer - the first three plus the fourth, whose records then stay put.
    // The fifth appends behind them instead of overwriting them.
    expect(resets).toHaveLength(4);

    maps.release();
    await flushDeathReadback();

    system.update(tick(0.02));

    expect(env.copies).toHaveLength(4);
    expect(env.copies.at(-1)!.size).toBe(2 * 40);
  });

  test('batches are delivered in submission order even when their maps resolve out of order', async () => {
    const env = makeMockDevice();
    const maps = holdDeathMaps(env);
    const system = new ParticleSystem(makeTexture(), { capacity: 8, device: env.device });
    const seen: number[] = [];

    system.addUpdateModule(new ApplyForce(0, 0));
    system.addDeathModule(
      new (class extends DeathModule {
        public override onDeath(_system: ParticleSystem, death: ParticleDeathContext): void {
          seen.push(death.x);
        }
      })(),
    );

    for (let i = 0; i < 2; i++) {
      const particle = system.emit()!;

      particle.lifetime = 0.02 * (i + 1);
    }

    system.update(tick(0));
    system.update(tick(0.02));
    system.update(tick(0.02));

    expect(env.copies).toHaveLength(2);

    stageDeathRecords(env, [{ x: 10, y: 0, velocityX: 0, velocityY: 0, rotation: 0, scaleX: 1, scaleY: 1, color: 0, slot: 0, elapsed: 0.02 }], 0);
    stageDeathRecords(env, [{ x: 20, y: 0, velocityX: 0, velocityY: 0, rotation: 0, scaleX: 1, scaleY: 1, color: 0, slot: 1, elapsed: 0.04 }], 1);

    // The second batch resolves first: it still waits for the one ahead of it.
    maps.release(1);
    maps.release(0);
    await flushDeathReadback();

    expect(seen).toEqual([10, 20]);
  });

  test('a death backlog past capacity is dropped rather than stalling, and reported once', async () => {
    const env = makeMockDevice();
    const maps = holdDeathMaps(env);
    const capacity = 2;
    const system = new ParticleSystem(makeTexture(), { capacity, device: env.device });
    const warnings: string[] = [];

    logger._resetOnce();

    const removeSink = logger.addSink(entry => {
      warnings.push(entry.message);
    });

    system.addUpdateModule(new ApplyForce(0, 0));
    system.addDeathModule(
      new (class extends DeathModule {
        public override onDeath(): void {
          // The delivery itself is covered elsewhere; this test is about the bound.
        }
      })(),
    );

    const emitDying = (): void => {
      const particle = system.emit();

      if (particle) particle.lifetime = 0.02;
    };

    try {
      emitDying();
      system.update(tick(0));

      // One particle expires per step and the slot is refilled right after, so
      // the backlog grows past capacity once the staging ring is occupied.
      for (let step = 0; step < 6; step++) {
        system.update(tick(0.02));
        emitDying();
      }

      expect(env.copies).toHaveLength(3);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('more than');

      // A second overflow on the same system stays quiet.
      system.update(tick(0.02));
      emitDying();

      expect(warnings).toHaveLength(1);

      // The simulation keeps running, and the copy never claims more than the
      // death buffer holds.
      maps.release();
      await flushDeathReadback();
      system.update(tick(0.02));

      expect(env.copies).toHaveLength(4);
      expect(env.copies.at(-1)!.size).toBe(capacity * 40);
    } finally {
      removeSink();
      logger._resetOnce();
    }
  });

  test('a system without death modules neither allocates nor reads a death buffer', () => {
    const env = makeMockDevice();
    const system = new ParticleSystem(makeTexture(), { capacity: 8, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    const particle = system.emit()!;

    particle.lifetime = 0.05;
    system.update(tick(0));
    system.update(tick(0.1));

    expect(() => findBufferByLabel(env, 'particle-deaths')).toThrow(/No buffer created/);
    expect(env.copies).toHaveLength(0);
    expect(env.shaderSources.at(-1)).not.toContain('atomicAdd');
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

  test("throws if a registered module lacks wgsl(), bypassing ParticleSystem's own eligibility guard", () => {
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

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
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
    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
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
    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
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
    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
    system.update(tick(0.016));

    const view = readFramesUniforms(env);

    expect(view[0]).toBe(0);
    expect(view[1]).toBe(1);
    expect(view[2]).toBe(1);
    expect(view[3]).toBe(0);
  });
});

describe('Out-of-range textureIndex', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  test('shows frame 0 on the CPU packer and in the generated compute shader alike', () => {
    const env = makeMockDevice();
    const tex = makeTexture(); // 16x16
    const frames = [new Rectangle(0, 0, 8, 8), new Rectangle(8, 0, 8, 8)];
    const system = new ParticleSystem(tex, frames, { capacity: 4, device: env.device });

    system.addUpdateModule(new ApplyForce(0, 0));

    const inRange = system._spawnSlot();
    const outOfRange = system._spawnSlot();
    const neverSet = system._spawnSlot();

    for (const slot of [inRange, outOfRange, neverSet]) {
      system._storage.lifetime[slot] = 10;
    }

    system._storage.frame[inRange] = 1;
    system._storage.frame[outOfRange] = 7;
    // `neverSet` keeps the zero-initialised default.

    system.update(tick(0.016));

    expect(system.gpuMode).toBe(true);

    // GPU side: the pack step selects frame 0 for an index past the declared
    // count, rather than clamping it to the last frame.
    const shaderSource = env.shaderSources[0]!;

    expect(shaderSource).toContain('select(0u, rawFrameIndex, rawFrameIndex < 2u)');
    expect(shaderSource).not.toContain('min(textureIndex[idx]');

    // CPU side: the same three particles packed through the render mode.
    const mode = new QuadParticles();

    mode.build(system, system._storage);

    const floats = new Float32Array(mode.data);
    const uvMinU = (instance: number): number => floats[instance * 10 + 6]!;

    // Frame 1 spans u 0.5..1 on a 16x16 texture, frame 0 spans u 0..0.5.
    expect(uvMinU(0)).toBeCloseTo(0.5);
    expect(uvMinU(1)).toBeCloseTo(0);
    // An index that was never set and one that is out of range are the same
    // particle as far as the atlas is concerned.
    expect(uvMinU(1)).toBe(uvMinU(2));
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

    // Two Turbulence instances share the same wgsl() `key` ("Turbulence") -
    // documented as unsupported ("Two ApplyForce instances on one system
    // aren't supported - combine into one", WgslContribution.key) but not
    // rejected at runtime. This is the only way to reach the prelude
    // deduplication branch, so we use it purely to exercise that path.
    system.addUpdateModule(new Turbulence(50));
    system.addUpdateModule(new Turbulence(30));

    const slot = system._spawnSlot();
    system._storage.lifetime[slot] = 10;
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

describe('SpawnOnDeath into a GPU-mode target system', () => {
  let restoreGlobals: () => void;

  beforeEach(() => {
    restoreGlobals = installGlobals();
  });

  afterEach(() => {
    restoreGlobals();
  });

  /**
   * Fill a GPU-mode system to capacity, then free one slot so the next spawn
   * recycles that hole instead of extending the live range.
   */
  const makeGpuTargetWithHole = (capacity: number, hole: number): ParticleSystem => {
    const env = makeMockDevice();
    const target = new ParticleSystem(makeTexture(), { capacity, device: env.device });

    target.addUpdateModule(new ApplyForce(0, 0));
    target.update(tick(0));

    for (let i = 0; i < capacity; i++) {
      const slot = target._spawnSlot();

      target._storage.lifetime[slot] = 10;
    }

    // Mirror what the GPU death path leaves behind: a dead slot below the
    // live-range high-water mark.
    target._storage.alive[hole] = 0;
    target._storage.lifetime[hole] = -1;

    return target;
  };

  test('recycled GPU slots receive the dying particle position', () => {
    const target = makeGpuTargetWithHole(4, 1);
    const parent = new ParticleSystem(makeTexture(), { capacity: 4 });

    expect(target.gpuMode).toBe(true);

    const parentSlot = parent._spawnSlot();

    parent._storage.posX[parentSlot] = 100;
    parent._storage.posY[parentSlot] = 50;

    const death = new SpawnOnDeath(target, new BurstSpawn({ schedule: [{ time: 0, count: 1 }], lifetime: new Constant(5) }));
    const liveCountBefore = target.liveCount;

    death.onDeath(parent, parent._storage.snapshot(parentSlot));

    // The spawn refilled the hole, so liveCount is unchanged - the signal the
    // old count-diff heuristic relied on never fires here.
    expect(target.liveCount).toBe(liveCountBefore);
    expect(target._storage.alive[1]).toBe(1);
    expect(target._storage.posX[1]).toBe(100);
    expect(target._storage.posY[1]).toBe(50);
  });

  test('CPU-mode targets still receive the dying particle position', () => {
    const target = new ParticleSystem(makeTexture(), { capacity: 4 });
    const parent = new ParticleSystem(makeTexture(), { capacity: 4 });

    const parentSlot = parent._spawnSlot();

    parent._storage.posX[parentSlot] = -20;
    parent._storage.posY[parentSlot] = 7;

    const death = new SpawnOnDeath(target, new BurstSpawn({ schedule: [{ time: 0, count: 1 }], lifetime: new Constant(5) }));

    death.onDeath(parent, parent._storage.snapshot(parentSlot));

    expect(target.liveCount).toBe(1);
    expect(target._storage.posX[0]).toBe(-20);
    expect(target._storage.posY[0]).toBe(7);
  });
});
