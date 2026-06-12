/// <reference types="@webgpu/types" />

import type { Rectangle } from '@codexo/exojs';
import type { Texture } from '@codexo/exojs';

import type { UpdateModule } from "#modules/UpdateModule";
import type { WgslContribution, WgslUniformField } from "#modules/WgslContribution";
import { wgslUniformByteSize } from "#modules/WgslContribution";
import type { ParticleSystem } from "#ParticleSystem";

/**
 * GPU-side mirror of one {@link ParticleSystem}. Owns:
 *
 * - **8 packed storage buffers** for the per-particle SoA data:
 *   positions/velocities/scales/rotInfo/timing as `vec2<f32>`, color and
 *   textureIndex as `u32`, plus the instance output buffer. Sits at the
 *   default WebGPU `maxStorageBuffersPerShaderStage = 8` limit.
 * - **One uniform buffer** for sim state (`dt`, `liveCount`).
 * - **One uniform buffer** for module configs (concatenated per-module
 *   structs with WGSL std140-ish alignment).
 * - **One uniform buffer** for frame UVs — `array<vec4<f32>, N>` where N
 *   is the system's frame count (or 1 when no atlas is declared). Each
 *   vec4 is `(uvMinX, uvMinY, uvMaxX, uvMaxY)` already flipY-adjusted.
 * - **N 1D textures** for modules that use lookup tables (Curve / ColorGradient).
 * - **Composite compute pipeline** built once at construction by
 *   concatenating the integration step + every registered module body +
 *   the pack-instances step into a single shader.
 *
 * The compute shader's pack-instances step reads `textureIndex[i]`, looks
 * up the matching frame UV, and writes a 40-byte interleaved record into
 * the instance output buffer (`STORAGE | VERTEX`). The renderer binds that
 * buffer directly as instanced vertex source — no readback.
 */

const workgroupSize = 64;
const instanceBytes = 40; // 5 × f32 + 1 × u32 + 4 × f32 (uvMin.xy, uvMax.xy)

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
  private readonly _textureIndex: GPUBuffer;

  private readonly _simUniformBuffer: GPUBuffer;
  private readonly _simUniformData: ArrayBuffer = new ArrayBuffer(16);
  private readonly _simUniformView: DataView;

  private readonly _moduleUniformBuffer: GPUBuffer | null;
  private readonly _moduleUniformData: ArrayBuffer | null;
  private readonly _moduleUniformView: DataView | null;
  private readonly _moduleSlots: readonly ModuleSlot[];

  private readonly _framesUniformBuffer: GPUBuffer;
  private readonly _framesUniformData: ArrayBuffer;
  private readonly _framesUniformView: Float32Array;
  private readonly _frameCount: number;

  private readonly _moduleTextures = new Map<string, GPUTexture>();
  private readonly _samplerFiltering: GPUSampler;
  private readonly _samplerNonFiltering: GPUSampler;

  private readonly _pipeline: GPUComputePipeline;
  private readonly _bindGroup0: GPUBindGroup;
  private readonly _bindGroup1: GPUBindGroup;

  public constructor(device: GPUDevice, capacity: number, modules: readonly UpdateModule[], frames: readonly Rectangle[], texture: Texture) {
    this.device = device;
    this.capacity = capacity;

    for (const m of modules) {
      if (!m.wgsl) {
        throw new Error(`ParticleGpuState: module ${m.constructor.name} has no wgsl() — ` + 'all registered UpdateModules must be GPU-eligible.');
      }
    }

    // Module uniform layout.
    const slots: ModuleSlot[] = [];
    let uniformOffset = 0;

    for (const m of modules) {
      const c = m.wgsl!();
      const fields = c.uniforms ?? [];
      const size = wgslUniformByteSize(fields);

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

    // Frames uniform buffer.
    this._frameCount = Math.max(1, frames.length);
    this._framesUniformData = new ArrayBuffer(this._frameCount * 16);
    this._framesUniformView = new Float32Array(this._framesUniformData);
    this._framesUniformBuffer = device.createBuffer({
      label: 'particle-frames-uniforms',
      size: this._framesUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._writeFrames(frames, texture);

    const vec2Bytes = capacity * 8;
    const u32Bytes = capacity * 4;

    this._positions = device.createBuffer({
      label: 'particle-positions',
      size: vec2Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._velocities = device.createBuffer({
      label: 'particle-velocities',
      size: vec2Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._scales = device.createBuffer({
      label: 'particle-scales',
      size: vec2Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._rotInfo = device.createBuffer({
      label: 'particle-rotInfo',
      size: vec2Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._timing = device.createBuffer({
      label: 'particle-timing',
      size: vec2Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._color = device.createBuffer({
      label: 'particle-color',
      size: u32Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this._textureIndex = device.createBuffer({
      label: 'particle-textureIndex',
      size: u32Bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = device.createBuffer({
      label: 'particle-instance-output',
      size: capacity * instanceBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._simUniformView = new DataView(this._simUniformData);
    this._simUniformBuffer = device.createBuffer({
      label: 'particle-sim-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // r32float textures aren't filterable in core WebGPU (would require
    // the optional `float32-filterable` feature). Use `nearest` for
    // r32float curve LUTs (256 taps is fine without interpolation) and
    // `linear` for rgba8unorm gradients which support filtering natively.
    this._samplerFiltering = device.createSampler({
      label: 'particle-lookup-sampler-filtering',
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
    });
    this._samplerNonFiltering = device.createSampler({
      label: 'particle-lookup-sampler-non-filtering',
      minFilter: 'nearest',
      magFilter: 'nearest',
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

    const wgsl = this._buildShader(slots);

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
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // textureIndex (matches WGSL `var<storage, read>`)
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
        { binding: 6, resource: { buffer: this._textureIndex } },
        { binding: 7, resource: { buffer: this.instanceBuffer } },
      ],
    });

    // Modules upload their lookup textures.
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

  public dispatch(system: ParticleSystem, dt: number): void {
    const liveCount = system.liveCount;

    if (liveCount <= 0) {
      return;
    }

    this._writeSimUniforms(dt, liveCount);
    this._writeModuleUniforms(dt);

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
    this._textureIndex.destroy();
    this.instanceBuffer.destroy();
    this._simUniformBuffer.destroy();
    this._framesUniformBuffer.destroy();
    this._moduleUniformBuffer?.destroy();

    for (const tex of this._moduleTextures.values()) {
      tex.destroy();
    }

    this._moduleTextures.clear();
  }

  private _writeFrames(frames: readonly Rectangle[], texture: Texture): void {
    const view = this._framesUniformView;
    const w = texture.width;
    const h = texture.height;
    const flipY = texture.flipY;

    if (frames.length === 0) {
      // Single-frame fallback — full texture.
      view[0] = 0;
      view[1] = flipY ? 1 : 0;
      view[2] = 1;
      view[3] = flipY ? 0 : 1;
    } else {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const o = i * 4;
        const minU = f.left / w;
        const maxU = f.right / w;
        const topV = f.top / h;
        const bottomV = f.bottom / h;

        view[o + 0] = minU;
        view[o + 1] = flipY ? bottomV : topV;
        view[o + 2] = maxU;
        view[o + 3] = flipY ? topV : bottomV;
      }
    }

    this.device.queue.writeBuffer(this._framesUniformBuffer, 0, this._framesUniformData);
  }

  /**
   * Push the listed CPU SoA slots to the GPU. Called by `ParticleSystem`
   * with newly-spawned slots and just-expired slots (lifetime sentinel).
   * Slots not in the dirty set are left alone — GPU keeps the integrated
   * state from previous compute dispatches.
   *
   * Each dirty slot triggers 7 small `queue.writeBuffer` calls (one per
   * SoA channel). For typical spawn rates (≤200/s) this is negligible
   * (≤1400 calls/s); contiguous-range batching is a future optimisation.
   */
  public uploadDirty(system: ParticleSystem, slots: Iterable<number>): void {
    const queue = this.device.queue;
    const scratch2 = this._dirtyScratchVec2;
    const scratch1 = this._dirtyScratchU32;

    for (const slot of slots) {
      const byteOffset2 = slot * 8;
      const byteOffset1 = slot * 4;

      scratch2[0] = system.posX[slot];
      scratch2[1] = system.posY[slot];
      queue.writeBuffer(this._positions, byteOffset2, scratch2.buffer, 0, 8);

      scratch2[0] = system.velX[slot];
      scratch2[1] = system.velY[slot];
      queue.writeBuffer(this._velocities, byteOffset2, scratch2.buffer, 0, 8);

      scratch2[0] = system.scaleX[slot];
      scratch2[1] = system.scaleY[slot];
      queue.writeBuffer(this._scales, byteOffset2, scratch2.buffer, 0, 8);

      scratch2[0] = system.rotations[slot];
      scratch2[1] = system.rotationSpeeds[slot];
      queue.writeBuffer(this._rotInfo, byteOffset2, scratch2.buffer, 0, 8);

      scratch2[0] = system.elapsed[slot];
      scratch2[1] = system.lifetime[slot];
      queue.writeBuffer(this._timing, byteOffset2, scratch2.buffer, 0, 8);

      scratch1[0] = system.color[slot];
      queue.writeBuffer(this._color, byteOffset1, scratch1.buffer, 0, 4);

      scratch1[0] = system.textureIndex[slot];
      queue.writeBuffer(this._textureIndex, byteOffset1, scratch1.buffer, 0, 4);
    }
  }

  private readonly _dirtyScratchVec2 = new Float32Array(2);
  private readonly _dirtyScratchU32 = new Uint32Array(1);

  private _writeSimUniforms(dt: number, liveCount: number): void {
    this._simUniformView.setFloat32(0, dt, true);
    this._simUniformView.setUint32(4, liveCount, true);
    this.device.queue.writeBuffer(this._simUniformBuffer, 0, this._simUniformData);
  }

  private _writeModuleUniforms(dt: number): void {
    if (this._moduleUniformView === null || this._moduleUniformBuffer === null || this._moduleUniformData === null) {
      return;
    }

    for (const slot of this._moduleSlots) {
      slot.module.writeUniforms?.(this._moduleUniformView, slot.uniformByteOffset, dt);
    }

    this.device.queue.writeBuffer(this._moduleUniformBuffer, 0, this._moduleUniformData);
  }

  private _buildBindGroup0Layout(slots: readonly ModuleSlot[]): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ];

    if (this._moduleUniformBuffer !== null) {
      entries.push({ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } });
    }

    let textureBindingIndex = this._moduleUniformBuffer !== null ? 3 : 2;

    for (const slot of slots) {
      for (const t of slot.contribution.textures ?? []) {
        const filterable = t.format !== 'r32float';

        entries.push({
          binding: textureBindingIndex++,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            viewDimension: '1d',
            sampleType: filterable ? 'float' : 'unfilterable-float',
          },
        });
        entries.push({
          binding: textureBindingIndex++,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: filterable ? 'filtering' : 'non-filtering' },
        });
      }
    }

    return this.device.createBindGroupLayout({ label: 'particle-uniforms-bgl', entries });
  }

  private _buildBindGroup0(layout: GPUBindGroupLayout, slots: readonly ModuleSlot[]): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this._simUniformBuffer } },
      { binding: 1, resource: { buffer: this._framesUniformBuffer } },
    ];

    if (this._moduleUniformBuffer !== null) {
      entries.push({ binding: 2, resource: { buffer: this._moduleUniformBuffer } });
    }

    let textureBindingIndex = this._moduleUniformBuffer !== null ? 3 : 2;

    for (const slot of slots) {
      for (const t of slot.contribution.textures ?? []) {
        const tex = this._moduleTextures.get(`${slot.contribution.key}_${t.name}`)!;
        const filterable = t.format !== 'r32float';
        const sampler = filterable ? this._samplerFiltering : this._samplerNonFiltering;

        entries.push({ binding: textureBindingIndex++, resource: tex.createView({ dimension: '1d' }) });
        entries.push({ binding: textureBindingIndex++, resource: sampler });
      }
    }

    return this.device.createBindGroup({ label: 'particle-uniforms-bg', layout, entries });
  }

  private _buildShader(slots: readonly ModuleSlot[]): string {
    const sections: string[] = [];

    sections.push(`
struct SimUniforms {
    dt: f32,
    liveCount: u32,
    _pad0: u32,
    _pad1: u32,
}

struct FrameUniforms {
    frames: array<vec4<f32>, ${this._frameCount}>,
}

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<uniform> frameUv: FrameUniforms;
        `);

    const moduleStructFields: string[] = [];

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
${moduleStructFields.map(s => `    ${s}`).join('\n')}
}

@group(0) @binding(2) var<uniform> modules: ModuleUniforms;
            `);
    }

    let textureBindingIndex = moduleStructFields.length > 0 ? 3 : 2;

    for (const slot of slots) {
      for (const t of slot.contribution.textures ?? []) {
        sections.push(`
@group(0) @binding(${textureBindingIndex++}) var u_${slot.contribution.key}_${t.name}: texture_1d<f32>;
@group(0) @binding(${textureBindingIndex++}) var u_${slot.contribution.key}_${t.name}_sampler: sampler;
                `);
      }
    }

    sections.push(`
@group(1) @binding(0) var<storage, read_write> positions: array<vec2<f32>>;
@group(1) @binding(1) var<storage, read_write> velocities: array<vec2<f32>>;
@group(1) @binding(2) var<storage, read_write> scales: array<vec2<f32>>;
@group(1) @binding(3) var<storage, read_write> rotInfo: array<vec2<f32>>;
@group(1) @binding(4) var<storage, read_write> timing: array<vec2<f32>>;
@group(1) @binding(5) var<storage, read_write> color: array<u32>;
@group(1) @binding(6) var<storage, read>       textureIndex: array<u32>;
@group(1) @binding(7) var<storage, read_write> instanceOutput: array<u32>;
        `);

    // Module preludes (helper functions/constants). Concatenated in
    // registration order; modules sharing the same key are emitted only
    // once (the contribution body strings are still inlined per-instance,
    // but the prelude function definitions can't be duplicated).
    const seenPreludeKeys = new Set<string>();

    for (const slot of slots) {
      const prelude = slot.contribution.prelude;

      if (prelude === undefined || prelude.trim() === '') continue;
      if (seenPreludeKeys.has(slot.contribution.key)) continue;

      seenPreludeKeys.add(slot.contribution.key);
      sections.push(prelude);
    }

    const moduleBodies = slots.map(s => s.contribution.body).join('\n');
    const frameCountConst = this._frameCount;

    sections.push(`
@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= sim.liveCount) { return; }

    let dt = sim.dt;

    // Skip dead particles (lifetime sentinel < 0). Write zero-scale instance
    // so the renderer doesn't accidentally draw them.
    if (timing[idx].y < 0.0) {
        let outBaseDead = idx * 10u;
        for (var k: u32 = 0u; k < 10u; k++) { instanceOutput[outBaseDead + k] = 0u; }
        return;
    }

    // Integration.
    positions[idx] = positions[idx] + velocities[idx] * dt;
    rotInfo[idx].x = rotInfo[idx].x + rotInfo[idx].y * dt;
    timing[idx].x = timing[idx].x + dt;

    // Module bodies (in registration order).
${moduleBodies}

    // Resolve frame UVs.
    let frameIndex = min(textureIndex[idx], ${frameCountConst}u - 1u);
    let frameUvBounds = frameUv.frames[frameIndex];

    // Pack interleaved instance data (10 u32s per particle):
    //   x, y, scaleX, scaleY, rotation (f32×5) + color (u32) + uvMin.xy (f32×2) + uvMax.xy (f32×2)
    let outBase = idx * 10u;
    instanceOutput[outBase + 0u] = bitcast<u32>(positions[idx].x);
    instanceOutput[outBase + 1u] = bitcast<u32>(positions[idx].y);
    instanceOutput[outBase + 2u] = bitcast<u32>(scales[idx].x);
    instanceOutput[outBase + 3u] = bitcast<u32>(scales[idx].y);
    instanceOutput[outBase + 4u] = bitcast<u32>(rotInfo[idx].x);
    instanceOutput[outBase + 5u] = color[idx];
    instanceOutput[outBase + 6u] = bitcast<u32>(frameUvBounds.x);
    instanceOutput[outBase + 7u] = bitcast<u32>(frameUvBounds.y);
    instanceOutput[outBase + 8u] = bitcast<u32>(frameUvBounds.z);
    instanceOutput[outBase + 9u] = bitcast<u32>(frameUvBounds.w);
}
        `);

    return sections.join('\n\n');
  }

  private _renderModuleStruct(key: string, fields: readonly WgslUniformField[]): string {
    const lines = fields.map(f => `    ${f.name}: ${f.type},`).join('\n');

    return `struct ${key}Uniforms {\n${lines}\n}`;
  }
}
