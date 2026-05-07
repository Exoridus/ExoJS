/// <reference types="@webgpu/types" />

import { ParticleSystem } from '@/particles/ParticleSystem';
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
    copyBufferToBuffer: jest.Mock;
    finish: jest.Mock;
}

const installGlobals = (): (() => void) => {
    const previousBufferUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
    const previousShaderStage = Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage');
    const previousMapMode = Object.getOwnPropertyDescriptor(globalThis, 'GPUMapMode');

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
    Object.defineProperty(globalThis, 'GPUMapMode', {
        configurable: true,
        value: { READ: 1, WRITE: 2 },
    });

    return () => {
        if (previousBufferUsage) Object.defineProperty(globalThis, 'GPUBufferUsage', previousBufferUsage);
        else delete (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage;
        if (previousShaderStage) Object.defineProperty(globalThis, 'GPUShaderStage', previousShaderStage);
        else delete (globalThis as { GPUShaderStage?: unknown }).GPUShaderStage;
        if (previousMapMode) Object.defineProperty(globalThis, 'GPUMapMode', previousMapMode);
        else delete (globalThis as { GPUMapMode?: unknown }).GPUMapMode;
    };
};

const makeMockDevice = () => {
    const buffers: Array<{ destroy: jest.Mock; mapAsync: jest.Mock; getMappedRange: jest.Mock; unmap: jest.Mock; }> = [];
    const pass: MockComputePass = {
        setPipeline: jest.fn(),
        setBindGroup: jest.fn(),
        dispatchWorkgroups: jest.fn(),
        end: jest.fn(),
    };
    const encoder: MockEncoder = {
        beginComputePass: jest.fn(() => pass),
        copyBufferToBuffer: jest.fn(),
        finish: jest.fn(() => ({ label: 'cb' } as unknown as GPUCommandBuffer)),
    };
    const queue = {
        writeBuffer: jest.fn(),
        submit: jest.fn(),
    };
    const computePipelineDescriptors: Array<GPUComputePipelineDescriptor> = [];
    const createComputePipeline = jest.fn((descriptor: GPUComputePipelineDescriptor) => {
        computePipelineDescriptors.push(descriptor);
        return {} as GPUComputePipeline;
    });
    const device = {
        createShaderModule: jest.fn(() => ({}) as GPUShaderModule),
        createBindGroupLayout: jest.fn(() => ({}) as GPUBindGroupLayout),
        createPipelineLayout: jest.fn(() => ({}) as GPUPipelineLayout),
        createBindGroup: jest.fn(() => ({}) as GPUBindGroup),
        createComputePipeline,
        createCommandEncoder: jest.fn(() => encoder as unknown as GPUCommandEncoder),
        createBuffer: jest.fn(() => {
            const buffer = {
                destroy: jest.fn(),
                mapAsync: jest.fn(() => Promise.resolve()),
                getMappedRange: jest.fn(() => new ArrayBuffer(64 * 1024)),
                unmap: jest.fn(),
            };
            buffers.push(buffer);
            return buffer as unknown as GPUBuffer;
        }),
        queue,
    } as unknown as GPUDevice;

    return { device, encoder, pass, queue, buffers, computePipelineDescriptors, createComputePipeline };
};

describe('ParticleSystem GPU integration', () => {
    let restoreGlobals: (() => void);

    beforeEach(() => {
        restoreGlobals = installGlobals();
    });

    afterEach(() => {
        restoreGlobals();
    });

    test('enableGpuIntegration creates compute pipeline and storage buffers', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), 1024);

        expect(system.gpuMode).toBe(false);

        system.enableGpuIntegration(env.device);

        expect(system.gpuMode).toBe(true);
        expect(system.gpuState).not.toBeNull();
        expect(env.createComputePipeline).toHaveBeenCalledTimes(1);

        // 7 storage buffers (posX/posY/velX/velY/rotation/rotSpeed/elapsed) +
        // 1 uniform buffer = 8 minimum. Readback buffers are lazy.
        expect((env.device.createBuffer as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    test('compute pipeline is created with @compute @workgroup_size shader', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), 256);

        system.enableGpuIntegration(env.device);

        const descriptor = env.computePipelineDescriptors[0];
        expect(descriptor.compute.entryPoint).toBe('main');

        const shaderModuleCall = (env.device.createShaderModule as jest.Mock).mock.calls[0]?.[0];
        expect(shaderModuleCall.code).toContain('@compute');
        expect(shaderModuleCall.code).toContain('workgroup_size(64)');
    });

    test('update() in GPU mode dispatches a compute pass per frame', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), 64);
        const slot = system.spawn();

        system.lifetime[slot] = 10;
        system.posX[slot] = 100;
        system.velX[slot] = 50;

        system.enableGpuIntegration(env.device);
        system.update(tick(0.016));

        // beginComputePass + setPipeline + setBindGroup + dispatch + end fired.
        expect(env.encoder.beginComputePass).toHaveBeenCalledTimes(1);
        expect(env.pass.setPipeline).toHaveBeenCalledTimes(1);
        expect(env.pass.setBindGroup).toHaveBeenCalledTimes(1);
        expect(env.pass.dispatchWorkgroups).toHaveBeenCalledTimes(1);
        expect(env.pass.end).toHaveBeenCalledTimes(1);

        // Expected workgroups: ceil(1 / 64) = 1.
        expect(env.pass.dispatchWorkgroups).toHaveBeenCalledWith(1);

        // Uniform + 7 storage uploads = 8 writeBuffer calls per frame.
        expect((env.queue.writeBuffer as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(8);

        // At least one submit (the integration dispatch). Readback adds
        // additional copy submits per channel — exact count is an
        // implementation detail.
        expect((env.queue.submit as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    test('disableGpuIntegration releases GPU resources and reverts to CPU integration', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), 64);
        const slot = system.spawn();

        system.lifetime[slot] = 10;
        system.velX[slot] = 100;

        system.enableGpuIntegration(env.device);
        expect(system.gpuMode).toBe(true);

        system.disableGpuIntegration();
        expect(system.gpuMode).toBe(false);
        expect(system.gpuState).toBeNull();

        // Subsequent update runs CPU integration (no compute dispatch).
        const dispatchesBefore = env.pass.dispatchWorkgroups.mock.calls.length;
        system.update(tick(0.016));
        expect(env.pass.dispatchWorkgroups.mock.calls.length).toBe(dispatchesBefore);
        // CPU integration advanced posX by velX * dt = 100 * 0.016 = 1.6
        expect(system.posX[0]).toBeCloseTo(1.6);
    });

    test('destroy releases GPU resources', () => {
        const env = makeMockDevice();
        const system = new ParticleSystem(makeTexture(), 64);

        system.enableGpuIntegration(env.device);

        const buffersBefore = env.buffers.length;
        system.destroy();

        // Each owned buffer's destroy() must be called.
        expect(env.buffers.slice(0, buffersBefore).every((b) => b.destroy.mock.calls.length > 0)).toBe(true);
        expect(system.gpuState).toBeNull();
    });
});
