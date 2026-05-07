/// <reference types="@webgpu/types" />

import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { UpdateModule } from '@/particles/modules/UpdateModule';
import type { WgslContribution, WgslUniformField } from '@/particles/modules/WgslContribution';
import { wgslUniformByteSize } from '@/particles/modules/WgslContribution';

/**
 * GPU-side mirror of one {@link ParticleSystem}. Owns:
 *
 * - **7 packed storage buffers** for the per-particle SoA data. Channels are
 *   combined into `vec2<f32>`-typed buffers (positions, velocities, scales,
 *   rotInfo = rotation+rotationSpeed, timing = elapsed+lifetime) to fit the
 *   `maxStorageBuffersPerShaderStage = 8` default WebGPU limit.
 * - **One uniform buffer** per system carrying `dt` + `liveCount`.
 * - **One uniform buffer** per system carrying packed module configs (each
 *   registered {@link UpdateModule}'s `wgsl()` declaration contributes a
 *   struct field; the system writes new values per frame).
 * - **N 1D textures** for modules that use lookup tables (Curve / Gradient).
 * - **Instance output buffer** with `STORAGE | VERTEX` usage — written by
 *   the compute shader's pack-instances step, then bound directly as the
 *   particle renderer's per-instance vertex source. **No CPU readback.**
 * - **Composite compute pipeline** built once at construction by
 *   concatenating the integration step, all registered module bodies, and
 *   the pack-instances step into a single shader.
 *
 * The system uploads its CPU SoA to GPU once per frame (deltas only would
 * require change tracking the modules don't provide), dispatches compute,
 * and the renderer reads from {@link instanceBuffer} directly. CPU-side
 * `posX[i]`, `velX[i]`, etc. are kept up to date for spawn writes only —
 * after the first GPU dispatch, GPU is the source of truth for position /
 * velocity / scale / rotation / color in the live range.
 */

const workgroupSize = 64;
const instanceBytes = 24;        // 5 × f32 + 1 × u32

interface ModuleSlot {
    module: UpdateModule;
    contribution: WgslContribution;
    uniformByteOffset: number;
    uniformByteSize: number;
}

export class ParticleGpuState {
    public readonly device: GPUDevice;
    public readonly capacity: number;

    /** GPU buffer holding interleaved per-instance vertex data, written by compute, read as VERTEX by the renderer. */
    public readonly instanceBuffer: GPUBuffer;

    private readonly _positions: GPUBuffer;
    private readonly _velocities: GPUBuffer;
    private readonly _scales: GPUBuffer;
    private readonly _rotInfo: GPUBuffer;
    private readonly _timing: GPUBuffer;
    private readonly _color: GPUBuffer;

    private readonly _simUniformBuffer: GPUBuffer;
    private readonly _simUniformData: ArrayBuffer = new ArrayBuffer(16);
    private readonly _simUniformView: DataView;

    private readonly _moduleUniformBuffer: GPUBuffer | null;
    private readonly _moduleUniformData: ArrayBuffer | null;
    private readonly _moduleUniformView: DataView | null;
    private readonly _moduleSlots: ReadonlyArray<ModuleSlot>;

    private readonly _moduleTextures: Map<string, GPUTexture> = new Map();
    private readonly _sampler: GPUSampler;

    private readonly _pipeline: GPUComputePipeline;
    private readonly _bindGroup0: GPUBindGroup;
    private readonly _bindGroup1: GPUBindGroup;

    // CPU-side staging arrays for pack-and-upload of SoA each frame.
    private readonly _packedPositions: Float32Array;
    private readonly _packedVelocities: Float32Array;
    private readonly _packedScales: Float32Array;
    private readonly _packedRotInfo: Float32Array;
    private readonly _packedTiming: Float32Array;

    public constructor(device: GPUDevice, capacity: number, modules: ReadonlyArray<UpdateModule>) {
        this.device = device;
        this.capacity = capacity;

        // Validate: every module must have wgsl(). Caller (ParticleSystem)
        // is supposed to filter, but a defensive check here surfaces the
        // contract clearly.
        for (const m of modules) {
            if (!m.wgsl) {
                throw new Error(
                    `ParticleGpuState: module ${m.constructor.name} has no wgsl() — `
                    + 'all registered UpdateModules must be GPU-eligible. '
                    + 'ParticleSystem must use CPU mode if any custom CPU-only module is registered.',
                );
            }
        }

        // Compute module uniform layout.
        const slots: Array<ModuleSlot> = [];
        let uniformOffset = 0;

        for (const m of modules) {
            const c = m.wgsl!();
            const fields = c.uniforms ?? [];
            const size = wgslUniformByteSize(fields);

            // Each module struct is 16-byte aligned within ModuleUniforms struct.
            uniformOffset = Math.ceil(uniformOffset / 16) * 16;

            slots.push({
                module: m,
                contribution: c,
                uniformByteOffset: uniformOffset,
                uniformByteSize: size,
            });

            uniformOffset += size;
        }

        const totalUniformBytes = Math.max(16, Math.ceil(uniformOffset / 16) * 16);

        this._moduleSlots = slots;

        if (uniformOffset > 0) {
            this._moduleUniformData = new ArrayBuffer(totalUniformBytes);
            this._moduleUniformView = new DataView(this._moduleUniformData);
            this._moduleUniformBuffer = device.createBuffer({
                label: 'particle-module-uniforms',
                size: totalUniformBytes,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        } else {
            this._moduleUniformData = null;
            this._moduleUniformView = null;
            this._moduleUniformBuffer = null;
        }

        // Allocate packed storage buffers. Each vec2 entry = 8 bytes.
        const vec2Bytes = capacity * 8;
        const u32Bytes = capacity * 4;

        this._positions = device.createBuffer({ label: 'particle-positions', size: vec2Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._velocities = device.createBuffer({ label: 'particle-velocities', size: vec2Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._scales = device.createBuffer({ label: 'particle-scales', size: vec2Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._rotInfo = device.createBuffer({ label: 'particle-rotInfo', size: vec2Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._timing = device.createBuffer({ label: 'particle-timing', size: vec2Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._color = device.createBuffer({ label: 'particle-color', size: u32Bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

        // Instance output: 24 bytes per particle (5 f32 + 1 u32). VERTEX
        // usage so the particle renderer can bind it as instanced vertex
        // attributes without copying.
        this.instanceBuffer = device.createBuffer({
            label: 'particle-instance-output',
            size: capacity * instanceBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // CPU staging arrays.
        this._packedPositions = new Float32Array(capacity * 2);
        this._packedVelocities = new Float32Array(capacity * 2);
        this._packedScales = new Float32Array(capacity * 2);
        this._packedRotInfo = new Float32Array(capacity * 2);
        this._packedTiming = new Float32Array(capacity * 2);

        // Sim uniforms.
        this._simUniformView = new DataView(this._simUniformData);
        this._simUniformBuffer = device.createBuffer({
            label: 'particle-sim-uniforms',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Sampler shared by all texture-using modules.
        this._sampler = device.createSampler({
            label: 'particle-lookup-sampler',
            minFilter: 'linear',
            magFilter: 'linear',
            addressModeU: 'clamp-to-edge',
        });

        // Allocate textures for modules that need them.
        for (const slot of slots) {
            const c = slot.contribution;

            if (!c.textures) continue;

            for (const t of c.textures) {
                const tex = device.createTexture({
                    label: `particle-tex-${c.key}-${t.name}`,
                    size: { width: 256, height: 1, depthOrArrayLayers: 1 },
                    format: t.format,
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
                    dimension: '1d',
                });

                this._moduleTextures.set(`${c.key}_${t.name}`, tex);
            }
        }

        // Build composite shader.
        const wgsl = this._buildShader(slots);

        // Bind group 0: uniforms + textures.
        const bindGroup0Layout = this._buildBindGroup0Layout(slots);
        const bindGroup1Layout = device.createBindGroupLayout({
            label: 'particle-soa-bgl',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
        });

        const pipelineLayout = device.createPipelineLayout({
            label: 'particle-compute-layout',
            bindGroupLayouts: [bindGroup0Layout, bindGroup1Layout],
        });

        const shaderModule = device.createShaderModule({
            label: 'particle-compute-shader',
            code: wgsl,
        });

        this._pipeline = device.createComputePipeline({
            label: 'particle-compute-pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'main',
            },
        });

        this._bindGroup0 = this._buildBindGroup0(bindGroup0Layout, slots);
        this._bindGroup1 = device.createBindGroup({
            label: 'particle-soa-bg',
            layout: bindGroup1Layout,
            entries: [
                { binding: 0, resource: { buffer: this._positions } },
                { binding: 1, resource: { buffer: this._velocities } },
                { binding: 2, resource: { buffer: this._scales } },
                { binding: 3, resource: { buffer: this._rotInfo } },
                { binding: 4, resource: { buffer: this._timing } },
                { binding: 5, resource: { buffer: this._color } },
                { binding: 6, resource: { buffer: this.instanceBuffer } },
            ],
        });

        // Modules upload their lookup textures. Each module gets a subset
        // map keyed by the texture's local `name` (without the module-key
        // prefix) for ergonomic lookups inside the module's body.
        for (const slot of slots) {
            if (!slot.module.uploadTextures) continue;

            const moduleTextures = new Map<string, GPUTexture>();

            for (const t of slot.contribution.textures ?? []) {
                const tex = this._moduleTextures.get(`${slot.contribution.key}_${t.name}`);

                if (tex !== undefined) {
                    moduleTextures.set(t.name, tex);
                }
            }

            slot.module.uploadTextures(device, moduleTextures);
        }
    }

    /**
     * Pack CPU SoA into staging arrays, upload to GPU, write module
     * uniforms, dispatch the compute pipeline. After this returns, the
     * GPU's {@link instanceBuffer} holds the rendered-ready interleaved
     * vertex data — the particle renderer can bind it directly without
     * any further CPU touchpoint.
     */
    public dispatch(system: ParticleSystem, dt: number): void {
        const liveCount = system.liveCount;

        if (liveCount <= 0) {
            return;
        }

        this._packAndUpload(system, liveCount);
        this._writeSimUniforms(dt, liveCount);
        this._writeModuleUniforms();

        const encoder = this.device.createCommandEncoder({ label: 'particle-compute' });
        const pass = encoder.beginComputePass({ label: 'particle-compute-pass' });

        pass.setPipeline(this._pipeline);
        pass.setBindGroup(0, this._bindGroup0);
        pass.setBindGroup(1, this._bindGroup1);
        pass.dispatchWorkgroups(Math.ceil(liveCount / workgroupSize));
        pass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    public destroy(): void {
        this._positions.destroy();
        this._velocities.destroy();
        this._scales.destroy();
        this._rotInfo.destroy();
        this._timing.destroy();
        this._color.destroy();
        this.instanceBuffer.destroy();
        this._simUniformBuffer.destroy();
        this._moduleUniformBuffer?.destroy();

        for (const tex of this._moduleTextures.values()) {
            tex.destroy();
        }

        this._moduleTextures.clear();
    }

    private _packAndUpload(system: ParticleSystem, liveCount: number): void {
        const packedPos = this._packedPositions;
        const packedVel = this._packedVelocities;
        const packedScale = this._packedScales;
        const packedRot = this._packedRotInfo;
        const packedTime = this._packedTiming;

        for (let i = 0; i < liveCount; i++) {
            const o = i * 2;

            packedPos[o + 0] = system.posX[i];
            packedPos[o + 1] = system.posY[i];
            packedVel[o + 0] = system.velX[i];
            packedVel[o + 1] = system.velY[i];
            packedScale[o + 0] = system.scaleX[i];
            packedScale[o + 1] = system.scaleY[i];
            packedRot[o + 0] = system.rotations[i];
            packedRot[o + 1] = system.rotationSpeeds[i];
            packedTime[o + 0] = system.elapsed[i];
            packedTime[o + 1] = system.lifetime[i];
        }

        const vec2Bytes = liveCount * 8;
        const u32Bytes = liveCount * 4;
        const queue = this.device.queue;

        queue.writeBuffer(this._positions, 0, packedPos.buffer as ArrayBuffer, 0, vec2Bytes);
        queue.writeBuffer(this._velocities, 0, packedVel.buffer as ArrayBuffer, 0, vec2Bytes);
        queue.writeBuffer(this._scales, 0, packedScale.buffer as ArrayBuffer, 0, vec2Bytes);
        queue.writeBuffer(this._rotInfo, 0, packedRot.buffer as ArrayBuffer, 0, vec2Bytes);
        queue.writeBuffer(this._timing, 0, packedTime.buffer as ArrayBuffer, 0, vec2Bytes);
        queue.writeBuffer(this._color, 0, system.color.buffer as ArrayBuffer, 0, u32Bytes);
    }

    private _writeSimUniforms(dt: number, liveCount: number): void {
        this._simUniformView.setFloat32(0, dt, true);
        this._simUniformView.setUint32(4, liveCount, true);
        this.device.queue.writeBuffer(this._simUniformBuffer, 0, this._simUniformData);
    }

    private _writeModuleUniforms(): void {
        if (this._moduleUniformView === null || this._moduleUniformBuffer === null || this._moduleUniformData === null) {
            return;
        }

        for (const slot of this._moduleSlots) {
            slot.module.writeUniforms?.(this._moduleUniformView, slot.uniformByteOffset);
        }

        this.device.queue.writeBuffer(this._moduleUniformBuffer, 0, this._moduleUniformData);
    }

    private _buildBindGroup0Layout(slots: ReadonlyArray<ModuleSlot>): GPUBindGroupLayout {
        const entries: Array<GPUBindGroupLayoutEntry> = [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ];

        if (this._moduleUniformBuffer !== null) {
            entries.push({ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } });
        }

        let textureBindingIdx = 2;

        for (const slot of slots) {
            for (const _t of slot.contribution.textures ?? []) {
                entries.push({
                    binding: textureBindingIdx++,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { viewDimension: '1d', sampleType: 'float' },
                });
                entries.push({
                    binding: textureBindingIdx++,
                    visibility: GPUShaderStage.COMPUTE,
                    sampler: { type: 'filtering' },
                });
            }
        }

        return this.device.createBindGroupLayout({ label: 'particle-uniforms-bgl', entries });
    }

    private _buildBindGroup0(layout: GPUBindGroupLayout, slots: ReadonlyArray<ModuleSlot>): GPUBindGroup {
        const entries: Array<GPUBindGroupEntry> = [
            { binding: 0, resource: { buffer: this._simUniformBuffer } },
        ];

        if (this._moduleUniformBuffer !== null) {
            entries.push({ binding: 1, resource: { buffer: this._moduleUniformBuffer } });
        }

        let textureBindingIdx = 2;

        for (const slot of slots) {
            for (const t of slot.contribution.textures ?? []) {
                const tex = this._moduleTextures.get(`${slot.contribution.key}_${t.name}`)!;

                entries.push({ binding: textureBindingIdx++, resource: tex.createView({ dimension: '1d' }) });
                entries.push({ binding: textureBindingIdx++, resource: this._sampler });
            }
        }

        return this.device.createBindGroup({ label: 'particle-uniforms-bg', layout, entries });
    }

    private _buildShader(slots: ReadonlyArray<ModuleSlot>): string {
        const sections: Array<string> = [];

        sections.push(`
struct SimUniforms {
    dt: f32,
    liveCount: u32,
    _pad0: u32,
    _pad1: u32,
}

@group(0) @binding(0) var<uniform> sim: SimUniforms;
        `);

        // Module uniform structs and combined ModuleUniforms.
        const moduleStructFields: Array<string> = [];

        for (const slot of slots) {
            const c = slot.contribution;
            const fields = c.uniforms ?? [];

            if (fields.length === 0) {
                continue;
            }

            sections.push(this._renderModuleStruct(c.key, fields));
            moduleStructFields.push(`u_${c.key}: ${c.key}Uniforms,`);
        }

        if (moduleStructFields.length > 0) {
            sections.push(`
struct ModuleUniforms {
${moduleStructFields.map((s) => `    ${s}`).join('\n')}
}

@group(0) @binding(1) var<uniform> modules: ModuleUniforms;
            `);
        }

        // Texture bindings.
        let textureBindingIdx = 2;

        for (const slot of slots) {
            for (const t of slot.contribution.textures ?? []) {
                sections.push(`
@group(0) @binding(${textureBindingIdx++}) var u_${slot.contribution.key}_${t.name}: texture_1d<f32>;
@group(0) @binding(${textureBindingIdx++}) var u_${slot.contribution.key}_${t.name}_sampler: sampler;
                `);
            }
        }

        // Group(1): SoA storage + instance output.
        sections.push(`
@group(1) @binding(0) var<storage, read_write> positions: array<vec2<f32>>;
@group(1) @binding(1) var<storage, read_write> velocities: array<vec2<f32>>;
@group(1) @binding(2) var<storage, read_write> scales: array<vec2<f32>>;
@group(1) @binding(3) var<storage, read_write> rotInfo: array<vec2<f32>>;
@group(1) @binding(4) var<storage, read_write> timing: array<vec2<f32>>;
@group(1) @binding(5) var<storage, read_write> color: array<u32>;
@group(1) @binding(6) var<storage, read_write> instanceOutput: array<u32>;
        `);

        // Main: integration → modules → pack-instances.
        const moduleBodies = slots.map((s) => s.contribution.body).join('\n');

        sections.push(`
@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= sim.liveCount) { return; }

    let dt = sim.dt;

    // Skip dead particles (lifetime sentinel < 0). Write zero-scale instance
    // so the renderer doesn't accidentally draw them.
    if (timing[idx].y < 0.0) {
        let outBase = idx * 6u;
        instanceOutput[outBase + 0u] = 0u;
        instanceOutput[outBase + 1u] = 0u;
        instanceOutput[outBase + 2u] = 0u;
        instanceOutput[outBase + 3u] = 0u;
        instanceOutput[outBase + 4u] = 0u;
        instanceOutput[outBase + 5u] = 0u;
        return;
    }

    // Integration.
    positions[idx] = positions[idx] + velocities[idx] * dt;
    rotInfo[idx].x = rotInfo[idx].x + rotInfo[idx].y * dt;
    timing[idx].x = timing[idx].x + dt;

    // Module bodies (in registration order).
${moduleBodies}

    // Pack interleaved instance data: x, y, scaleX, scaleY, rotation (f32), color (u32).
    let outBase = idx * 6u;
    instanceOutput[outBase + 0u] = bitcast<u32>(positions[idx].x);
    instanceOutput[outBase + 1u] = bitcast<u32>(positions[idx].y);
    instanceOutput[outBase + 2u] = bitcast<u32>(scales[idx].x);
    instanceOutput[outBase + 3u] = bitcast<u32>(scales[idx].y);
    instanceOutput[outBase + 4u] = bitcast<u32>(rotInfo[idx].x);
    instanceOutput[outBase + 5u] = color[idx];
}
        `);

        return sections.join('\n\n');
    }

    private _renderModuleStruct(key: string, fields: ReadonlyArray<WgslUniformField>): string {
        const lines = fields.map((f) => `    ${f.name}: ${f.type},`).join('\n');

        return `struct ${key}Uniforms {\n${lines}\n}`;
    }
}
