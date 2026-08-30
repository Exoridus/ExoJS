/// <reference types="@webgpu/types" />

import type { Rectangle } from '@codexo/exojs';
import type { Texture } from '@codexo/exojs';
import type { ComputeBindGroupEntry } from '@codexo/exojs/renderer-sdk';
import { fillShaderSource, reflectComputeBindings, WebGpuComputePipeline, WebGpuStorageBuffer, WebGpuUniformBuffer } from '@codexo/exojs/renderer-sdk';

import type { UpdateModule } from '#modules/UpdateModule';
import type { WgslContribution, WgslUniformField } from '#modules/WgslContribution';
import { getWgslUniformByteSize } from '#modules/WgslContribution';
import type { ParticleSystem } from '#ParticleSystem';

import particleSimulateWgsl from './shaders/particle-simulate.wgsl';

/**
 * GPU-side mirror of one {@link ParticleSystem}. Owns:
 *
 * - **8 packed storage buffers** for the per-particle SoA data:
 *   positions/velocities/scales/rotInfo/timing as `vec2<f32>`, color and
 *   textureIndex as `u32`, plus the instance output buffer. Sits at the
 *   default WebGPU `maxStorageBuffersPerShaderStage = 8` limit. Built on
 *   the shared {@link WebGpuStorageBuffer} SDK primitive.
 * - **Three uniform buffers** (sim state `dt`/`liveCount`, module configs -
 *   concatenated per-module structs with WGSL std140-ish alignment - and
 *   frame UVs, `array<vec4<f32>, N>` where N is the system's frame count or
 *   1 when no atlas is declared, each vec4 `(uvMinX, uvMinY, uvMaxX, uvMaxY)`
 *   already flipY-adjusted), built on the shared {@link WebGpuUniformBuffer}
 *   SDK primitive.
 * - **N 1D textures** for modules that use lookup tables (Curve / ColorGradient).
 * - **Composite compute pipeline** built once at construction by
 *   concatenating the integration step + every registered module body +
 *   the pack-instances step into a single shader, via the shared
 *   {@link WebGpuComputePipeline} SDK primitive (two bind groups: group 0
 *   holds uniforms + module lookup textures/samplers, group 1 holds the
 *   8 SoA storage buffers). The bind-group *layouts* are derived straight
 *   from the shader's own `@group`/`@binding` declarations via
 *   {@link reflectComputeBindings} - no hand-written binding list kept in
 *   sync with the WGSL text by hand.
 *
 * The compute shader's pack-instances step reads `textureIndex[i]`, looks
 * up the matching frame UV, and writes a 40-byte interleaved record into
 * the instance output buffer (`STORAGE | VERTEX`). The renderer binds that
 * buffer directly as instanced vertex source - no readback.
 */

const workgroupSize = 64;
const instanceBytes = 40; // 5 x f32 + 1 x u32 + 4 x f32 (uvMin.xy, uvMax.xy)
/** 8 x f32 (position, velocity, rotation, scale, elapsed) + 2 x u32 (color, slot). */
const deathRecordBytes = 40;
const deathStagingSlots = 3;
const minDeathStagingRecords = 32;
const deathRecordFloats = 10;

/** One readback slot of the death staging ring. */
interface DeathStagingSlot {
  buffer: GPUBuffer;
  records: number;
  busy: boolean;
}

/** A copy that has been submitted into a staging slot and not yet delivered. */
interface StagedDeathBatch {
  slot: DeathStagingSlot;
  count: number;
}

/**
 * One particle's state as the compute shader captured it at death, plus the
 * slot it occupied. The slot orders the records; it never leaves the package.
 * @internal
 */
export interface ParticleDeathRecord {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly elapsed: number;
  readonly color: number;
  readonly slot: number;
}

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

  private readonly _positions: WebGpuStorageBuffer;
  private readonly _velocities: WebGpuStorageBuffer;
  private readonly _scales: WebGpuStorageBuffer;
  private readonly _rotInfo: WebGpuStorageBuffer;
  private readonly _timing: WebGpuStorageBuffer;
  private readonly _color: WebGpuStorageBuffer;
  private readonly _instanceStorageBuffer: WebGpuStorageBuffer;

  /**
   * Death records the compute shader appended, plus the atomic append counter
   * in its first four bytes. Allocated only while the system has death modules,
   * so a system without them pays neither the memory nor the copy.
   *
   * Detecting a death and reporting one have separate lifetimes, and the path
   * between them has four stages: the shader appends here; records the copy has
   * not taken yet stay here as a device-side backlog; a copy moves a batch into
   * a staging slot; and the mapped batches are handed on in submission order.
   */
  private _deathBuffer: WebGpuStorageBuffer | null = null;
  private readonly _deathCounterReset = new Uint32Array(1);

  /**
   * Readback slots for the death buffer. A slot stays unavailable from the
   * submit that copies into it until its map resolves, so a single slot would
   * make every death that happens while a readback is in flight either a
   * validation error or a lost record. Three slots cover the queue depth a
   * frame loop runs at; a fourth death batch waits on the device instead.
   */
  private readonly _deathStaging: DeathStagingSlot[] = [];

  /** Copies submitted into a staging slot, oldest first, awaiting delivery. */
  private readonly _stagedDeaths: StagedDeathBatch[] = [];

  /**
   * Whether the death buffer holds records no readback has claimed yet. The
   * append counter is reset only once a copy has taken them, so a step that
   * finds no free staging slot leaves its records in place and the next step
   * appends behind them.
   */
  private _deathBufferDirty = false;

  /** Tail of the delivery chain, so batches are reported in submission order. */
  private _deathDelivery: Promise<void> = Promise.resolve();

  private readonly _simUniformBuffer: WebGpuUniformBuffer;
  private readonly _simUniformData: ArrayBuffer = new ArrayBuffer(16);
  private readonly _simUniformView: DataView;

  private _moduleUniformBuffer: WebGpuUniformBuffer | null = null;
  private _moduleUniformData: ArrayBuffer | null = null;
  private _moduleUniformView: DataView | null = null;
  private _moduleSlots: readonly ModuleSlot[] = [];

  private readonly _framesUniformBuffer: WebGpuUniformBuffer;
  private readonly _framesUniformData: ArrayBuffer;
  private readonly _framesUniformView: Float32Array;
  private readonly _frameCount: number;

  private readonly _moduleTextures = new Map<string, GPUTexture>();
  private readonly _samplerFiltering: GPUSampler;
  private readonly _samplerNonFiltering: GPUSampler;

  private _pipelineWrapper: WebGpuComputePipeline | null = null;
  private _bindGroup0: GPUBindGroup | null = null;
  private _bindGroup1: GPUBindGroup | null = null;
  private _reportsDeaths = false;
  private _destroyed = false;

  public constructor(
    device: GPUDevice,
    capacity: number,
    modules: readonly UpdateModule[],
    frames: readonly Rectangle[],
    texture: Texture,
    reportsDeaths = false,
  ) {
    this.device = device;
    this.capacity = capacity;

    this._frameCount = Math.max(1, frames.length);
    this._framesUniformData = new ArrayBuffer(this._frameCount * 16);
    this._framesUniformView = new Float32Array(this._framesUniformData);
    this._framesUniformBuffer = new WebGpuUniformBuffer(device, this._framesUniformData.byteLength, 'particle-frames-uniforms');
    this._writeFrames(frames, texture);

    const vec2Bytes = capacity * 8;
    const vec4Bytes = capacity * 16;
    const u32Bytes = capacity * 4;

    this._positions = new WebGpuStorageBuffer(device, vec2Bytes, 'particle-positions');
    this._velocities = new WebGpuStorageBuffer(device, vec2Bytes, 'particle-velocities');
    this._scales = new WebGpuStorageBuffer(device, vec2Bytes, 'particle-scales');
    // Rotation carries the atlas frame in its third lane: the default WebGPU
    // limit is 8 storage buffers per stage, and the death buffer needs the slot
    // a separate frame-index buffer used to hold. Module bodies address
    // rotInfo[idx].x / .y exactly as before.
    this._rotInfo = new WebGpuStorageBuffer(device, vec4Bytes, 'particle-rotInfo');
    this._timing = new WebGpuStorageBuffer(device, vec2Bytes, 'particle-timing');
    this._color = new WebGpuStorageBuffer(device, u32Bytes, 'particle-color');

    this._instanceStorageBuffer = new WebGpuStorageBuffer(device, capacity * instanceBytes, 'particle-instance-output', GPUBufferUsage.VERTEX);
    this.instanceBuffer = this._instanceStorageBuffer.buffer;

    this._simUniformView = new DataView(this._simUniformData);
    this._simUniformBuffer = new WebGpuUniformBuffer(device, 16, 'particle-sim-uniforms');

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

    this.setProgram(modules, reportsDeaths);
  }

  /**
   * Compiles the pipeline for `modules` and binds it to the buffers this state
   * already owns.
   *
   * The simulation lives in those buffers, not in the program, so changing the
   * module list rebuilds the shader, its uniforms and its lookup textures while
   * every live particle keeps the position and velocity the GPU last integrated.
   */
  public setProgram(modules: readonly UpdateModule[], reportsDeaths: boolean): void {
    for (const m of modules) {
      if (!m.wgsl) {
        throw new Error(`ParticleGpuState: module ${m.constructor.name} has no wgsl() - all registered UpdateModules must be GPU-eligible.`);
      }
    }

    this._destroyProgram();
    this._reportsDeaths = reportsDeaths;

    // Module uniform layout.
    const slots: ModuleSlot[] = [];
    let uniformOffset = 0;

    for (const m of modules) {
      const c = m.wgsl!();
      const fields = c.uniforms ?? [];
      const size = getWgslUniformByteSize(fields);

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
      this._moduleUniformBuffer = new WebGpuUniformBuffer(this.device, totalUniformBytes, 'particle-module-uniforms');
    }

    if (reportsDeaths && this._deathBuffer === null) {
      // Four bytes of atomic append counter, then one record per slot: a frame
      // can at most report every particle the system holds.
      this._deathBuffer = new WebGpuStorageBuffer(this.device, 4 + this.capacity * deathRecordBytes, 'particle-deaths', GPUBufferUsage.COPY_SRC);
    }

    // Allocate textures for modules that need them.
    for (const slot of slots) {
      const c = slot.contribution;

      if (!c.textures) continue;

      for (const t of c.textures) {
        const tex = this.device.createTexture({
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

    this._pipelineWrapper = WebGpuComputePipeline.create(this.device, {
      wgsl,
      workgroupSize,
      bindingGroups: reflectComputeBindings(wgsl, { nonFilteringResources: this._nonFilteringResourceNames(slots) }),
      label: 'particle-compute',
    });

    this._bindGroup0 = this._pipelineWrapper.createBindGroup(0, this._buildBindGroup0Entries(slots), 'particle-uniforms-bg');
    this._bindGroup1 = this._pipelineWrapper.createBindGroup(1, this._buildSoaBindGroupEntries(), 'particle-soa-bg');

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

      slot.module.uploadTextures(this.device, moduleTextures);
    }
  }

  /** Releases everything the current program owns, leaving the simulation buffers untouched. */
  private _destroyProgram(): void {
    this._moduleUniformBuffer?.destroy();
    this._moduleUniformBuffer = null;
    this._moduleUniformData = null;
    this._moduleUniformView = null;
    this._moduleSlots = [];

    for (const tex of this._moduleTextures.values()) {
      tex.destroy();
    }

    this._moduleTextures.clear();

    this._pipelineWrapper = null;
    this._bindGroup0 = null;
    this._bindGroup1 = null;
  }

  /**
   * Runs one simulation step over `[0, dispatchCount)`.
   *
   * `pendingDeaths` is how many expired particles the caller is still holding,
   * including the ones it marked for this step. The shader appends exactly one
   * record per marked particle, so the readback copies the used prefix of the
   * death buffer without first having to read its counter back - the count is
   * already known on this side.
   *
   * Returns whether a death batch was staged for readback. Deaths stay on the
   * device while every staging slot is in flight, so a step can report deaths
   * without staging any, and a later step can stage a batch spanning several
   * steps. A caller keeping per-death state has to hold it, and keep counting it
   * into `pendingDeaths`, until a step stages - then hand over all of it.
   */
  public dispatch(dt: number, dispatchCount: number, pendingDeaths = 0): boolean {
    const pipeline = this._pipelineWrapper;
    const bindGroup0 = this._bindGroup0;
    const bindGroup1 = this._bindGroup1;

    if (pipeline === null || bindGroup0 === null || bindGroup1 === null) {
      return false;
    }

    const simulating = dispatchCount > 0;
    const reporting = pendingDeaths > 0 && this._reportsDeaths && this._deathBuffer !== null;

    // A system whose last particles just expired has nothing left to simulate,
    // but its records still have to reach a staging slot - otherwise the last
    // deaths of a system are never delivered.
    if (!simulating && !reporting) {
      return false;
    }

    if (simulating) {
      this._writeSimUniforms(dt, dispatchCount);
      this._writeModuleUniforms(dt);
    }

    if (reporting && !this._deathBufferDirty) {
      this._deathCounterReset[0] = 0;
      this._deathBuffer!.write(this._deathCounterReset, 0);
    }

    const encoder = this.device.createCommandEncoder({ label: 'particle-compute' });

    if (simulating) {
      const pass = encoder.beginComputePass({ label: 'particle-compute-pass' });

      pipeline.dispatch(pass, dispatchCount, [bindGroup0, bindGroup1]);

      pass.end();
    }

    let staged = false;

    if (reporting) {
      this._deathBufferDirty = true;

      // The death buffer holds one record per slot. Records left over several
      // steps can exceed that when slots are recycled and die again, and appends
      // past the end are dropped by the device - so the copy must never claim
      // more than the buffer can hold.
      const count = Math.min(pendingDeaths, this.capacity);
      const slot = this._acquireDeathStaging(count);

      if (slot !== null) {
        encoder.copyBufferToBuffer(this._deathBuffer!.buffer, 4, slot.buffer, 0, count * deathRecordBytes);
        slot.busy = true;
        this._stagedDeaths.push({ slot, count });
        this._deathBufferDirty = false;
        staged = true;
      }
    }

    this.device.queue.submit([encoder.finish()]);

    return staged;
  }

  /**
   * Resolves the oldest staged death batch and hands its records to `receive`
   * once the copy has landed.
   *
   * The mapping is asynchronous by nature, so a death is delivered no earlier
   * than the frame after it happened. Batches are delivered in the order they
   * were submitted, and nothing blocks on a map: further steps keep staging
   * into other slots while one is in flight. A device that goes away mid-map
   * resolves to nothing rather than throwing: the deaths are lost with the
   * simulation that produced them.
   */
  public readDeaths(receive: (records: readonly ParticleDeathRecord[]) => void): Promise<void> {
    const batch = this._stagedDeaths.shift();

    if (batch === undefined || this._destroyed) {
      return Promise.resolve();
    }

    const previous = this._deathDelivery;
    let settled: () => void;

    // The chain only orders the batches. A death callback that throws must
    // reach its caller, but it must not leave the batches behind it waiting on
    // a rejected promise, so the successor waits on this separate handle.
    this._deathDelivery = new Promise<void>(resolve => {
      settled = resolve;
    });

    return this._deliverDeaths(batch, previous, receive).finally(() => settled());
  }

  private async _deliverDeaths(batch: StagedDeathBatch, previous: Promise<void>, receive: (records: readonly ParticleDeathRecord[]) => void): Promise<void> {
    const { slot, count } = batch;
    const bytes = count * deathRecordBytes;

    try {
      await slot.buffer.mapAsync(GPUMapMode.READ, 0, bytes);
    } catch {
      slot.busy = false;

      return;
    }

    if (this._destroyed) {
      slot.busy = false;

      return;
    }

    const records: ParticleDeathRecord[] = [];
    const mapped = slot.buffer.getMappedRange(0, bytes);
    const floats = new Float32Array(mapped);
    const uints = new Uint32Array(mapped);

    for (let i = 0; i < count; i++) {
      const base = i * deathRecordFloats;

      records.push({
        x: floats[base + 0]!,
        y: floats[base + 1]!,
        velocityX: floats[base + 2]!,
        velocityY: floats[base + 3]!,
        rotation: floats[base + 4]!,
        scaleX: floats[base + 5]!,
        scaleY: floats[base + 6]!,
        elapsed: floats[base + 7]!,
        color: uints[base + 8]!,
        slot: uints[base + 9]!,
      });
    }

    slot.buffer.unmap();
    // Released before waiting on the batch ahead: a slot held across that wait
    // would shrink the ring for no reason.
    slot.busy = false;

    // The shader appends through an atomic, so records arrive in whatever order
    // the workgroups finished. Slot order is reproducible and matches what the
    // CPU compaction pass would have reported.
    records.sort((a, b) => a.slot - b.slot);

    await previous;

    if (this._destroyed) {
      return;
    }

    receive(records);
  }

  /**
   * Claims a staging slot able to hold `records`, or null while every slot of
   * the ring is still in flight.
   */
  private _acquireDeathStaging(records: number): DeathStagingSlot | null {
    let reusable: DeathStagingSlot | null = null;

    for (const slot of this._deathStaging) {
      if (slot.busy) continue;

      if (slot.records >= records) {
        return slot;
      }

      reusable = slot;
    }

    if (reusable === null && this._deathStaging.length >= deathStagingSlots) {
      return null;
    }

    const size = Math.max(records, (reusable?.records ?? 0) * 2, minDeathStagingRecords);
    const buffer = this.device.createBuffer({
      label: 'particle-deaths-staging',
      size: size * deathRecordBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    if (reusable !== null) {
      reusable.buffer.destroy();
      reusable.buffer = buffer;
      reusable.records = size;

      return reusable;
    }

    const slot: DeathStagingSlot = { buffer, records: size, busy: false };

    this._deathStaging.push(slot);

    return slot;
  }

  private _releaseDeathStaging(): void {
    for (const slot of this._deathStaging) {
      slot.buffer.destroy();
    }

    this._deathStaging.length = 0;
    this._stagedDeaths.length = 0;
    this._deathBufferDirty = false;
  }

  public destroy(): void {
    this._destroyed = true;
    this._destroyProgram();

    this._positions.destroy();
    this._velocities.destroy();
    this._scales.destroy();
    this._rotInfo.destroy();
    this._timing.destroy();
    this._color.destroy();
    this._instanceStorageBuffer.destroy();
    this._simUniformBuffer.destroy();
    this._framesUniformBuffer.destroy();
    this._deathBuffer?.destroy();
    this._deathBuffer = null;
    this._releaseDeathStaging();
  }

  private _writeFrames(frames: readonly Rectangle[], texture: Texture): void {
    const view = this._framesUniformView;
    const w = texture.width;
    const h = texture.height;
    const flipY = texture.flipY;

    if (frames.length === 0) {
      // Single-frame fallback - full texture.
      view[0] = 0;
      view[1] = flipY ? 1 : 0;
      view[2] = 1;
      view[3] = flipY ? 0 : 1;
    } else {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
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

    this._framesUniformBuffer.write(this._framesUniformView);
  }

  /**
   * Push the listed CPU SoA slots to the GPU. Called by `ParticleSystem`
   * with newly-spawned slots and just-expired slots (lifetime sentinel).
   * Slots not in the dirty set are left alone - GPU keeps the integrated
   * state from previous compute dispatches.
   *
   * Each dirty slot triggers 7 small writes (one per SoA channel, via
   * {@link WebGpuStorageBuffer.write}). For typical spawn rates (≤200/s)
   * this is negligible (≤1400 calls/s); contiguous-range batching is a
   * future optimisation.
   */
  public uploadDirty(system: ParticleSystem, slots: Iterable<number>): void {
    const scratch2 = this._dirtyScratchVec2;
    const scratch4 = this._dirtyScratchVec4;
    const scratch1 = this._dirtyScratchU32;
    const storage = system._storage;

    for (const slot of slots) {
      const byteOffset2 = slot * 8;
      const byteOffset1 = slot * 4;

      scratch2[0] = storage.posX[slot]!;
      scratch2[1] = storage.posY[slot]!;
      this._positions.write(scratch2, byteOffset2);

      scratch2[0] = storage.velX[slot]!;
      scratch2[1] = storage.velY[slot]!;
      this._velocities.write(scratch2, byteOffset2);

      scratch2[0] = storage.scaleX[slot]!;
      scratch2[1] = storage.scaleY[slot]!;
      this._scales.write(scratch2, byteOffset2);

      scratch4[0] = storage.rotations[slot]!;
      scratch4[1] = storage.rotationSpeeds[slot]!;
      scratch4[2] = storage.frame[slot]!;
      scratch4[3] = 0;
      this._rotInfo.write(scratch4, slot * 16);

      scratch2[0] = storage.elapsed[slot]!;
      scratch2[1] = storage.lifetime[slot]!;
      this._timing.write(scratch2, byteOffset2);

      scratch1[0] = storage.color[slot]!;
      this._color.write(scratch1, byteOffset1);
    }
  }

  /**
   * Marks `slot` expired for the device without touching anything else about
   * it. Only the lifetime lane is written: a full slot upload would push the
   * CPU's stale position and velocity over the values the device integrated,
   * and those are exactly what the death record is supposed to carry.
   */
  public uploadExpiry(slot: number): void {
    this._expiryScratch[0] = -1;
    this._timing.write(this._expiryScratch, slot * 8 + 4);
  }

  private readonly _expiryScratch = new Float32Array(1);
  private readonly _dirtyScratchVec2 = new Float32Array(2);
  private readonly _dirtyScratchVec4 = new Float32Array(4);
  private readonly _dirtyScratchU32 = new Uint32Array(1);

  private _writeSimUniforms(dt: number, liveCount: number): void {
    this._simUniformView.setFloat32(0, dt, true);
    this._simUniformView.setUint32(4, liveCount, true);
    this._simUniformBuffer.write(this._simUniformView);
  }

  private _writeModuleUniforms(dt: number): void {
    if (this._moduleUniformView === null || this._moduleUniformBuffer === null || this._moduleUniformData === null) {
      return;
    }

    for (const slot of this._moduleSlots) {
      slot.module.writeUniforms?.(this._moduleUniformView, slot.uniformByteOffset, dt);
    }

    this._moduleUniformBuffer.write(this._moduleUniformView);
  }

  /**
   * WGSL variable names of module lookup textures/samplers whose format isn't natively
   * filterable (`r32float` Curve LUTs) - fed to {@link reflectComputeBindings} so it declares
   * `'unfilterable-float'`/`'non-filtering'` for those specific bindings instead of the default
   * `'float'`/`'filtering'`, an ambiguity the WGSL text itself can't resolve (see that
   * function's doc comment).
   */
  private _nonFilteringResourceNames(slots: readonly ModuleSlot[]): Set<string> {
    const names = new Set<string>();

    for (const slot of slots) {
      for (const t of slot.contribution.textures ?? []) {
        if (t.format === 'r32float') {
          names.add(`u_${slot.contribution.key}_${t.name}`);
          names.add(`u_${slot.contribution.key}_${t.name}_sampler`);
        }
      }
    }

    return names;
  }

  /** Group-0 bind-group entries, matching group 0's bindings (reflected from the shader text) one-to-one. */
  private _buildBindGroup0Entries(slots: readonly ModuleSlot[]): ComputeBindGroupEntry[] {
    const entries: ComputeBindGroupEntry[] = [
      { binding: 0, buffer: this._simUniformBuffer.buffer },
      { binding: 1, buffer: this._framesUniformBuffer.buffer },
    ];

    if (this._moduleUniformBuffer !== null) {
      entries.push({ binding: 2, buffer: this._moduleUniformBuffer.buffer });
    }

    let textureBindingIndex = this._moduleUniformBuffer !== null ? 3 : 2;

    for (const slot of slots) {
      for (const t of slot.contribution.textures ?? []) {
        const tex = this._moduleTextures.get(`${slot.contribution.key}_${t.name}`)!;
        const filterable = t.format !== 'r32float';
        const sampler = filterable ? this._samplerFiltering : this._samplerNonFiltering;

        entries.push({ binding: textureBindingIndex++, textureView: tex.createView({ dimension: '1d' }) });
        entries.push({ binding: textureBindingIndex++, sampler });
      }
    }

    return entries;
  }

  /** Group-1 bind-group entries: the 8 SoA storage buffers, matching group 1's bindings (reflected from the shader text) one-to-one. */
  private _buildSoaBindGroupEntries(): ComputeBindGroupEntry[] {
    const entries: ComputeBindGroupEntry[] = [
      { binding: 0, buffer: this._positions.buffer },
      { binding: 1, buffer: this._velocities.buffer },
      { binding: 2, buffer: this._scales.buffer },
      { binding: 3, buffer: this._rotInfo.buffer },
      { binding: 4, buffer: this._timing.buffer },
      { binding: 5, buffer: this._color.buffer },
      { binding: 6, buffer: this._instanceStorageBuffer.buffer },
    ];

    if (this._reportsDeaths && this._deathBuffer !== null) {
      entries.push({ binding: 7, buffer: this._deathBuffer.buffer });
    }

    return entries;
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
@group(1) @binding(3) var<storage, read_write> rotInfo: array<vec4<f32>>;
@group(1) @binding(4) var<storage, read_write> timing: array<vec2<f32>>;
@group(1) @binding(5) var<storage, read_write> color: array<u32>;
@group(1) @binding(6) var<storage, read_write> instanceOutput: array<u32>;
        `);

    if (this._reportsDeaths) {
      sections.push(`
struct DeathRecord {
    x: f32,
    y: f32,
    velocityX: f32,
    velocityY: f32,
    rotation: f32,
    scaleX: f32,
    scaleY: f32,
    elapsed: f32,
    color: u32,
    slot: u32,
}

struct DeathBuffer {
    count: atomic<u32>,
    records: array<DeathRecord>,
}

@group(1) @binding(7) var<storage, read_write> deaths: DeathBuffer;
            `);
    }

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

    sections.push(`
${fillShaderSource(particleSimulateWgsl, { workgroupSize, moduleBodies, frameCount: this._frameCount, deathReport: this._deathReportSource() })}        `);

    return sections.join('\n\n');
  }

  /**
   * The block that captures a particle's state the first time the shader sees
   * its expiry sentinel, or nothing when the system has no death modules.
   *
   * The CPU marks an expired particle with `lifetime = -1` and the shader
   * rewrites that to `-2` once captured, so exactly one record is appended per
   * death even though a dead slot is visited every frame until it is reused.
   */
  private _deathReportSource(): string {
    if (!this._reportsDeaths) {
      return '';
    }

    return `
    if (timing[idx].y > -1.5) {
        // The CPU found this particle expired from an elapsed time it had
        // already advanced for this frame, so the device owes it the matching
        // integration step before the snapshot is taken. Without it a death
        // reported from the GPU would sit one step behind the same death
        // reported from the CPU pipeline.
        positions[idx] = positions[idx] + velocities[idx] * dt;
        rotInfo[idx].x = rotInfo[idx].x + rotInfo[idx].y * dt;
        timing[idx].x = timing[idx].x + dt;

        let at = atomicAdd(&deaths.count, 1u);

        deaths.records[at].x = positions[idx].x;
        deaths.records[at].y = positions[idx].y;
        deaths.records[at].velocityX = velocities[idx].x;
        deaths.records[at].velocityY = velocities[idx].y;
        deaths.records[at].rotation = rotInfo[idx].x;
        deaths.records[at].scaleX = scales[idx].x;
        deaths.records[at].scaleY = scales[idx].y;
        deaths.records[at].elapsed = timing[idx].x;
        deaths.records[at].color = color[idx];
        deaths.records[at].slot = idx;

        timing[idx].y = -2.0;
    }`;
  }

  private _renderModuleStruct(key: string, fields: readonly WgslUniformField[]): string {
    const lines = fields.map(f => `    ${f.name}: ${f.type},`).join('\n');

    return `struct ${key}Uniforms {\n${lines}\n}`;
  }
}
