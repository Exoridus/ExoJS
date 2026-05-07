/// <reference types="@webgpu/types" />

import type { ParticleSystem } from '@/particles/ParticleSystem';
import { WebGpuStorageBuffer } from '@/rendering/webgpu/compute/WebGpuStorageBuffer';
import { WebGpuComputePipeline } from '@/rendering/webgpu/compute/WebGpuComputePipeline';

/**
 * GPU-side mirror of one {@link ParticleSystem}. Owns:
 *
 *  - Storage buffers for the system's hot SoA channels (position, velocity,
 *    rotation, elapsed, lifetime). Allocated up to {@link ParticleSystem.capacity}
 *    so no reallocations happen in the steady state.
 *  - A 32-byte uniform buffer carrying `dt` and `liveCount` per dispatch.
 *  - One compute pipeline + bind group for the integration shader.
 *
 * Lifecycle: created on demand via {@link ParticleSystem.enableGpuMode}
 * once a `WebGpuBackend` is initialised. Synced from CPU SoA each frame
 * before the dispatch (see {@link ParticleSystem.update}'s GPU branch).
 *
 * **Scope of this initial cut:** GPU runs only the integration step
 * (advance position by velocity, rotation by rotationSpeed, elapsed by dt).
 * Update and death modules continue to execute on the CPU; the system
 * mirrors GPU output back into the CPU SoA after each dispatch so the
 * existing renderer (which reads from CPU arrays) keeps working unchanged.
 *
 * Future expansion: built-in `UpdateModule` subclasses gain WGSL-emitting
 * counterparts (`ApplyForce`, `Drag`, `Color/Scale/RotateOverLifetime`)
 * which the system concatenates into one larger compute shader, dropping
 * the CPU readback. Custom user modules will continue to force CPU mode.
 */

const integrationShader = /* wgsl */`
struct SimUniforms {
    dt: f32,
    liveCount: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read_write> posX: array<f32>;
@group(0) @binding(2) var<storage, read_write> posY: array<f32>;
@group(0) @binding(3) var<storage, read>       velX: array<f32>;
@group(0) @binding(4) var<storage, read>       velY: array<f32>;
@group(0) @binding(5) var<storage, read_write> rotation: array<f32>;
@group(0) @binding(6) var<storage, read>       rotSpeed: array<f32>;
@group(0) @binding(7) var<storage, read_write> elapsed: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;

    if (idx >= sim.liveCount) {
        return;
    }

    let dt = sim.dt;

    posX[idx] = posX[idx] + velX[idx] * dt;
    posY[idx] = posY[idx] + velY[idx] * dt;
    rotation[idx] = rotation[idx] + rotSpeed[idx] * dt;
    elapsed[idx] = elapsed[idx] + dt;
}
`;

const uniformBytes = 16; // 4 floats / u32s, std140-compatible alignment

export class ParticleGpuState {
    public readonly device: GPUDevice;
    public readonly capacity: number;

    private readonly _pipeline: WebGpuComputePipeline;
    private readonly _uniformBuffer: GPUBuffer;
    private readonly _uniformData: ArrayBuffer = new ArrayBuffer(uniformBytes);
    private readonly _uniformF32: Float32Array;
    private readonly _uniformU32: Uint32Array;

    private readonly _posX: WebGpuStorageBuffer;
    private readonly _posY: WebGpuStorageBuffer;
    private readonly _velX: WebGpuStorageBuffer;
    private readonly _velY: WebGpuStorageBuffer;
    private readonly _rotation: WebGpuStorageBuffer;
    private readonly _rotationSpeed: WebGpuStorageBuffer;
    private readonly _elapsed: WebGpuStorageBuffer;

    private readonly _bindGroup: GPUBindGroup;

    public constructor(device: GPUDevice, capacity: number) {
        this.device = device;
        this.capacity = capacity;

        const float32Bytes = capacity * Float32Array.BYTES_PER_ELEMENT;

        this._posX = new WebGpuStorageBuffer(device, float32Bytes, 'particle-posX');
        this._posY = new WebGpuStorageBuffer(device, float32Bytes, 'particle-posY');
        this._velX = new WebGpuStorageBuffer(device, float32Bytes, 'particle-velX');
        this._velY = new WebGpuStorageBuffer(device, float32Bytes, 'particle-velY');
        this._rotation = new WebGpuStorageBuffer(device, float32Bytes, 'particle-rotation');
        this._rotationSpeed = new WebGpuStorageBuffer(device, float32Bytes, 'particle-rotSpeed');
        this._elapsed = new WebGpuStorageBuffer(device, float32Bytes, 'particle-elapsed');

        this._uniformF32 = new Float32Array(this._uniformData);
        this._uniformU32 = new Uint32Array(this._uniformData);
        this._uniformBuffer = device.createBuffer({
            label: 'particle-sim-uniforms',
            size: uniformBytes,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._pipeline = WebGpuComputePipeline.create(device, {
            label: 'particle-integration',
            wgsl: integrationShader,
            workgroupSize: 64,
            bindings: [
                { binding: 0, type: 'uniform' },
                { binding: 1, type: 'storage' },
                { binding: 2, type: 'storage' },
                { binding: 3, type: 'storage-read' },
                { binding: 4, type: 'storage-read' },
                { binding: 5, type: 'storage' },
                { binding: 6, type: 'storage-read' },
                { binding: 7, type: 'storage' },
            ],
        });

        this._bindGroup = this._pipeline.createBindGroup([
            { binding: 0, buffer: this._uniformBuffer },
            { binding: 1, buffer: this._posX.buffer },
            { binding: 2, buffer: this._posY.buffer },
            { binding: 3, buffer: this._velX.buffer },
            { binding: 4, buffer: this._velY.buffer },
            { binding: 5, buffer: this._rotation.buffer },
            { binding: 6, buffer: this._rotationSpeed.buffer },
            { binding: 7, buffer: this._elapsed.buffer },
        ], 'particle-sim-bg');
    }

    /**
     * Push the current CPU SoA state into the GPU storage buffers. Called
     * each frame before the compute dispatch so newly spawned particles
     * land on the GPU. Only the live range `[0, liveCount)` is uploaded.
     */
    public uploadFromCpu(system: ParticleSystem): void {
        const count = system.liveCount;

        if (count <= 0) {
            return;
        }

        const byteSize = count * Float32Array.BYTES_PER_ELEMENT;

        this._posX.write(system.posX.subarray(0, count), 0, byteSize);
        this._posY.write(system.posY.subarray(0, count), 0, byteSize);
        this._velX.write(system.velX.subarray(0, count), 0, byteSize);
        this._velY.write(system.velY.subarray(0, count), 0, byteSize);
        this._rotation.write(system.rotations.subarray(0, count), 0, byteSize);
        this._rotationSpeed.write(system.rotationSpeeds.subarray(0, count), 0, byteSize);
        this._elapsed.write(system.elapsed.subarray(0, count), 0, byteSize);
    }

    /** Encode the integration dispatch into `encoder` for `liveCount` particles. */
    public dispatch(encoder: GPUCommandEncoder, dt: number, liveCount: number): void {
        if (liveCount <= 0) {
            return;
        }

        this._uniformF32[0] = dt;
        this._uniformU32[1] = liveCount;
        this.device.queue.writeBuffer(this._uniformBuffer, 0, this._uniformData);

        const pass = encoder.beginComputePass({ label: 'particle-integration-pass' });

        pass.setPipeline(this._pipeline.pipeline);
        pass.setBindGroup(0, this._bindGroup);
        this._pipeline.dispatch(pass, liveCount);
        pass.end();
    }

    /**
     * Read GPU output back into the CPU SoA arrays. Required when the CPU
     * still drives expire detection and update modules — without this the
     * CPU SoA goes stale after the GPU dispatch.
     *
     * Async: caller must `await` before relying on the data.
     */
    public async downloadToCpu(system: ParticleSystem): Promise<void> {
        const count = system.liveCount;

        if (count <= 0) {
            return;
        }

        // Read all four mutated channels in parallel.
        await Promise.all([
            this._posX.read(system.posX.subarray(0, count)),
            this._posY.read(system.posY.subarray(0, count)),
            this._rotation.read(system.rotations.subarray(0, count)),
            this._elapsed.read(system.elapsed.subarray(0, count)),
        ]);
    }

    public destroy(): void {
        this._posX.destroy();
        this._posY.destroy();
        this._velX.destroy();
        this._velY.destroy();
        this._rotation.destroy();
        this._rotationSpeed.destroy();
        this._elapsed.destroy();
        this._uniformBuffer.destroy();
    }
}
