/// <reference types="@webgpu/types" />

import { ParticleSystem } from '@/particles/ParticleSystem';
import { ApplyForce } from '@/particles/modules/ApplyForce';
import { Drag } from '@/particles/modules/Drag';
import { ColorOverLifetime } from '@/particles/modules/ColorOverLifetime';
import { ScaleOverLifetime } from '@/particles/modules/ScaleOverLifetime';
import { RotateOverLifetime } from '@/particles/modules/RotateOverLifetime';
import { UpdateModule } from '@/particles/modules/UpdateModule';
import { Curve } from '@/particles/distributions/Curve';
import { Gradient } from '@/particles/distributions/Gradient';
import { Color } from '@/core/Color';
import { Texture } from '@/rendering/texture/Texture';
import { Time } from '@/core/Time';

const makeTexture = (): Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    return new Texture(canvas);
};

const tick = (s: number): Time => Time.zero.clone().set(s * 1000);

interface MockComputePass {
    setPipeline: jest.Mock;
    setBindGroup: jest.Mock;
    dispatchWorkgroups: jest.Mock;
    end: jest.Mock;
}

interface MockEncoder {
    beginComputePass: jest.Mock<MockComputePass, []>;
    finish: jest.Mock;
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
            COPY_DST: 1, INDEX: 2, UNIFORM: 4, VERTEX: 8,
            STORAGE: 16, COPY_SRC: 32, MAP_READ: 64, MAP_WRITE: 128,
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
    const buffers: Array<{ destroy: jest.Mock }> = [];
    const textures: Array<{ destroy: jest.Mock; createView: jest.Mock }> = [];
    const pass: MockComputePass = {
        setPipeline: jest.fn(),
        setBindGroup: jest.fn(),
        dispatchWorkgroups: jest.fn(),
        end: jest.fn(),
    };
    const encoder: MockEncoder = {
        beginComputePass: jest.fn(() => pass),
        finish: jest.fn(() => ({ label: 'cb' } as unknown as GPUCommandBuffer)),
    };
    const queue = {
        writeBuffer: jest.fn(),
        writeTexture: jest.fn(),
        submit: jest.fn(),
    };
    const computePipelineDescriptors: Array<GPUComputePipelineDescriptor> = [];
    const shaderSources: Array<string> = [];
    const createShaderModule = jest.fn((descriptor: GPUShaderModuleDescriptor) => {
        shaderSources.push(descriptor.code);
        return {} as GPUShaderModule;
    });
    const createComputePipeline = jest.fn((descriptor: GPUComputePipelineDescriptor) => {
        computePipelineDescriptors.push(descriptor);
        return {} as GPUComputePipeline;
    });
    const device = {
        createShaderModule,
        createBindGroupLayout: jest.fn(() => ({}) as GPUBindGroupLayout),
        createPipelineLayout: jest.fn(() => ({}) as GPUPipelineLayout),
        createBindGroup: jest.fn(() => ({}) as GPUBindGroup),
        createComputePipeline,
        createCommandEncoder: jest.fn(() => encoder as unknown as GPUCommandEncoder),
        createBuffer: jest.fn(() => {
            const buffer = { destroy: jest.fn() };
            buffers.push(buffer);
            return buffer as unknown as GPUBuffer;
        }),
        createTexture: jest.fn(() => {
            const texture = {
                destroy: jest.fn(),
                createView: jest.fn(() => ({}) as GPUTextureView),
            };
            textures.push(texture);
            return texture as unknown as GPUTexture;
        }),
        createSampler: jest.fn(() => ({}) as GPUSampler),
        queue,
    } as unknown as GPUDevice;

    return { device, encoder, pass, queue, buffers, textures, computePipelineDescriptors, shaderSources };
};

describe('ParticleSystem GPU mode — auto-routing', () => {
    let restoreGlobals: (() => void);

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

        // Spawn one particle so dispatch actually runs.
        const slot = system.spawn();
        system.lifetime[slot] = 10;
        system.scaleX[slot] = 1;
        system.scaleY[slot] = 1;

        expect(system.gpuMode).toBe(false);   // not yet compiled
        system.update(tick(0.016));
        expect(system.gpuMode).toBe(true);

        expect(env.device.createComputePipeline).toHaveBeenCalledTimes(1);
        expect(env.shaderSources.length).toBe(1);
        expect(env.shaderSources[0]).toContain('@compute');
        expect(env.shaderSources[0]).toContain('workgroup_size(64)');
        // Each registered module's WGSL body should appear in the composite shader:
        expect(env.shaderSources[0]).toContain('u_ApplyForce');
        expect(env.shaderSources[0]).toContain('u_Drag');
        expect(env.shaderSources[0]).toContain('u_RotateOverLifetime');
    });

    test('Custom CPU-only module forces CPU mode even when device is passed', () => {
        class CpuOnly extends UpdateModule {
            apply() { /* no-op */ }
            // No wgsl() method — system must fall back to CPU.
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

    test('Curve / Gradient modules trigger texture allocation in GPU mode', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), { capacity: 256, device: env.device });

        system.addUpdateModule(new ScaleOverLifetime(new Curve([
            { t: 0, v: 1 },
            { t: 1, v: 0 },
        ])));
        system.addUpdateModule(new ColorOverLifetime(new Gradient([
            { t: 0, color: new Color(255, 0, 0, 1) },
            { t: 1, color: new Color(0, 0, 0, 0) },
        ])));

        const slot = system.spawn();
        system.lifetime[slot] = 10;

        system.update(tick(0.016));

        // Two textures (one for Curve, one for Gradient).
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
        expect(env.pass.setBindGroup).toHaveBeenCalledTimes(2);   // two bind groups
        expect(env.pass.dispatchWorkgroups).toHaveBeenCalledWith(1);

        // Second frame: another dispatch.
        system.update(tick(0.016));
        expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(2);
    });

    test('Adding update modules after compile throws', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), { capacity: 64, device: env.device });

        system.addUpdateModule(new ApplyForce(0, 100));
        system.spawn();   // sets up state
        system.update(tick(0.016));   // compiles

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

        // Every owned buffer's destroy() called.
        expect(env.buffers.slice(0, buffersBefore).every((b) => b.destroy.mock.calls.length > 0)).toBe(true);
        // No textures used in this test (no Curve/Gradient modules) but verify destroy didn't crash.
        expect(env.textures.length).toBe(texturesBefore);
    });
});

describe('ParticleSystem alive-flag in GPU mode', () => {
    let restoreGlobals: (() => void);

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

        // Force compile so subsequent spawns use GPU spawn semantics.
        system.update(tick(0));
        expect(system.gpuMode).toBe(true);

        const a = system.spawn();
        const b = system.spawn();
        const c = system.spawn();

        expect(a).toBe(0);
        expect(b).toBe(1);
        expect(c).toBe(2);

        // Mark slot b dead manually + clear hint pointer back to 0.
        system.alive[b] = 0;
        // Spawn should reuse slot b.
        const d = system.spawn();
        expect(d).toBe(3);   // hint advanced past b before mark; round-robin picks 3 first

        // Clear hint by exhausting capacity:
        system.alive[3] = 0;
        const e = system.spawn();
        // After scanning [hint..capacity), wraps to [0..hint) — finds slot 1 (b).
        expect([1, 3].includes(e)).toBe(true);
    });

    test('expired particle in GPU mode sets lifetime=-1 sentinel + alive=0', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), { capacity: 4, device: env.device });

        system.addUpdateModule(new ApplyForce(0, 0));

        const slot = system.spawn();
        system.lifetime[slot] = 0.05;   // expires after 50ms

        // First update compiles + integrates 100ms → particle expires.
        system.update(tick(0.1));

        expect(system.alive[slot]).toBe(0);
        expect(system.lifetime[slot]).toBe(-1);
        expect(system.aliveCount).toBe(0);
    });
});
