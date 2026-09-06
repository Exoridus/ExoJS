/// <reference types="@webgpu/types" />

import { type AnyMaterial, isTextureUniformValue, type UniformValue } from '#rendering/material/Material';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import type { WebGpuBackend } from './WebGpuBackend';

/**
 * Shared user-uniform handling for the WebGPU custom-material paths
 * (WebGpuSpriteRenderer / WebGpuMeshRenderer group(2)).
 *
 * The two renderers pack an identical `@group(2)` layout - one uniform buffer
 * per declared block followed by texture/sampler pairs - so the packing,
 * change-detection, and bind-group caching live here to keep them byte-for-byte
 * consistent.
 *
 * The core contract: the per-material buffers and the GPU bind group are reused
 * across frames and re-uploaded/rebuilt only when the material's uniform VALUES
 * (or bound texture views) actually change - a static custom-material scene then
 * issues zero uniform writes and zero bind-group creations per frame instead of
 * one of each per flush.
 *
 * A material whose shader source declares a uniform schema owns its bytes
 * already, in the canonical std140 layout: those buffers are uploaded straight
 * from the block and gated on the block's revision. A material without one is
 * packed here into the legacy one-16-byte-slot-per-name buffer.
 * @internal
 */

/** Whether a uniform value is a bound texture rather than a scalar/vector. */
export const isTextureUniform = (value: UniformValue): value is Texture | RenderTexture => isTextureUniformValue(value);

/** Scalar/vector/matrix uniforms (texture values excluded) in declaration order. */
export const collectScalarUniforms = (material: AnyMaterial): Array<Exclude<UniformValue, Texture | RenderTexture>> => {
  const result: Array<Exclude<UniformValue, Texture | RenderTexture>> = [];

  for (const name of material._bindingSchema.scalarUniformNames) {
    result.push(material._getUniformValue(name) as Exclude<UniformValue, Texture | RenderTexture>);
  }

  return result;
};

/**
 * Texture bindings claimed by the material, in a stable order: texture-valued
 * entries of `uniforms` first (declaration order), then the dedicated
 * `textures` map (declaration order). The WGSL source must declare its
 * `@group(2)` texture/sampler pairs in this same order.
 */
export const collectTextureBindings = (material: AnyMaterial): Array<Texture | RenderTexture> => {
  const result: Array<Texture | RenderTexture> = [];

  for (const name of material._bindingSchema.textureUniformNames) {
    result.push(material._getUniformValue(name) as Texture | RenderTexture);
  }

  for (const name of material._bindingSchema.textureNames) {
    result.push(material._getTextureValue(name));
  }

  return result;
};

/**
 * Uniform-buffer bindings the material claims at the start of its user group:
 * one per declared block, and one for the packed buffer otherwise. Texture
 * bindings start after them.
 */
export const userUniformBindingCount = (material: AnyMaterial): number => Math.max(material._blocks.length, 1);

/**
 * Persistent, per-material cache for a custom material's `@group(2)` resources.
 * Reused across frames; recreated wholesale when its owning material resource
 * bundle is (re)built on reconnect so a lost device never keeps stale handles.
 *
 * The parallel arrays are indexed by uniform-buffer binding and are sized once
 * per material, so a frame allocates nothing here.
 */
export interface UserUniformState {
  /** One buffer per uniform-buffer binding. */
  buffers: Array<GPUBuffer | null>;
  /** Allocated size of each buffer, which may exceed what a batch writes. */
  capacities: number[];
  /** Bytes the pending write covers, decided by the plan step. */
  byteLengths: number[];
  /** Block revision last uploaded into each buffer; `-1` before the first upload. */
  revisions: number[];
  /** Plan scratch: whether the buffer at this binding must be written. */
  pendingWrites: boolean[];
  /** Plan scratch: the outgrown buffer the apply step frees. */
  pendingStale: Array<GPUBuffer | null>;
  /** CPU mirror of the packed buffer, used only without a uniform schema. */
  data: Float32Array;
  /** Float count populated on the last packed upload; `-1` before the first. */
  floatCount: number;
  /** Cached user bind group, or `null` before the first build / after an invalidation. */
  bindGroup: GPUBindGroup | null;
  /** Buffer identities the cached bind group binds - a new buffer invalidates it. */
  bindGroupBuffers: Array<GPUBuffer | null>;
  /** Texture views the cached bind group binds - a refreshed view invalidates it. */
  bindGroupViews: GPUTextureView[];
  /** Samplers the cached bind group binds - a refreshed sampler invalidates it. */
  bindGroupSamplers: GPUSampler[];
}

/** The subset of a material's cached GPU resources this module owns. */
export interface UserUniformResources {
  readonly userUniform: UserUniformState;
}

/** Fresh, empty {@link UserUniformState} for a newly created material resource bundle. */
export const createUserUniformState = (): UserUniformState => ({
  buffers: [],
  capacities: [],
  byteLengths: [],
  revisions: [],
  pendingWrites: [],
  pendingStale: [],
  data: new Float32Array(0),
  floatCount: -1,
  bindGroup: null,
  bindGroupBuffers: [],
  bindGroupViews: [],
  bindGroupSamplers: [],
});

/** Drop every cached handle so a device-loss teardown never keeps stale GPU objects. */
export const resetUserUniformState = (state: UserUniformState): void => {
  state.buffers = [];
  state.capacities = [];
  state.byteLengths = [];
  state.revisions = [];
  state.pendingWrites = [];
  state.pendingStale = [];
  state.data = new Float32Array(0);
  state.floatCount = -1;
  state.bindGroup = null;
  state.bindGroupBuffers = [];
  state.bindGroupViews = [];
  state.bindGroupSamplers = [];
};

/** Free every uniform buffer the material holds. */
export const destroyUserUniformBuffers = (state: UserUniformState): void => {
  for (const buffer of state.buffers) {
    buffer?.destroy();
  }

  state.buffers = [];
  state.capacities = [];
  state.bindGroup = null;
  state.bindGroupBuffers = [];
};

/**
 * Bytes required to hold `scalarCount` material uniforms without a schema -
 * each occupies one `<=vec4` 16-byte slot, with a minimum of one slot to satisfy
 * WebGPU's minimum uniform-buffer size.
 */
export const userUniformBufferBytes = (scalarCount: number): number => Math.max(scalarCount, 1) * 16;

const ensureBindingCapacity = (state: UserUniformState, count: number): void => {
  while (state.buffers.length < count) {
    state.buffers.push(null);
    state.capacities.push(0);
    state.byteLengths.push(0);
    state.revisions.push(-1);
    state.pendingWrites.push(false);
    state.pendingStale.push(null);
  }
};

const ensureBuffer = (state: UserUniformState, index: number, byteLength: number, device: GPUDevice, label: string): void => {
  state.byteLengths[index] = byteLength;

  if (state.buffers[index] !== null && state.capacities[index]! >= byteLength) {
    return;
  }

  // The outgrown buffer is NOT destroyed here: a draw already recorded into the
  // open pass may still read it, so the apply step frees it once the caller has
  // settled the pass.
  state.pendingStale[index] = state.buffers[index] ?? null;
  state.capacities[index] = byteLength;
  state.buffers[index] = device.createBuffer({ label, size: byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  // A fresh buffer holds undefined contents and voids any bind group that
  // referenced the old identity.
  state.revisions[index] = -1;
  state.bindGroup = null;
};

/**
 * Decide what this batch must upload, without touching the queue.
 *
 * The upload is split into a plan and an apply step because the write is a
 * hazard, not a detail: it lands on the queue timeline ahead of the whole
 * submit, so a draw already recorded into the open pass would read this batch's
 * values instead of its own. The caller answers that with its pass, then calls
 * {@link applyUserUniformUpload}.
 *
 * A material whose values did not change since its last upload plans no write.
 */
export const planUserUniformUpload = (material: AnyMaterial, resources: UserUniformResources, device: GPUDevice, label: string): void => {
  const state = resources.userUniform;
  const blocks = material._blocks;

  if (blocks.length === 0) {
    const scalarValues = collectScalarUniforms(material);

    ensureBindingCapacity(state, 1);
    ensureBuffer(state, 0, userUniformBufferBytes(scalarValues.length), device, label);
    state.pendingWrites[0] = packUserUniforms(scalarValues, state, state.revisions[0] === -1);
    state.revisions[0] = 0;

    return;
  }

  ensureBindingCapacity(state, blocks.length);

  for (const [index, block] of blocks.entries()) {
    ensureBuffer(state, index, block.byteLength, device, label);
    state.pendingWrites[index] = state.revisions[index] !== block.revision;
  }
};

/** Free the outgrown buffers and upload the planned bytes, once the pass is settled. */
export const applyUserUniformUpload = (material: AnyMaterial, resources: UserUniformResources, device: GPUDevice): void => {
  const state = resources.userUniform;
  const blocks = material._blocks;

  for (const [index, stale] of state.pendingStale.entries()) {
    if (stale !== null) {
      stale.destroy();
      state.pendingStale[index] = null;
    }
  }

  if (blocks.length === 0) {
    if (state.pendingWrites[0] === true) {
      const data = state.data;

      device.queue.writeBuffer(state.buffers[0]!, 0, data.buffer, data.byteOffset, state.byteLengths[0]);
      state.pendingWrites[0] = false;
    }

    return;
  }

  for (const [index, block] of blocks.entries()) {
    if (state.pendingWrites[index] === true) {
      const data = block.float32;

      device.queue.writeBuffer(state.buffers[index]!, 0, data.buffer, data.byteOffset, block.byteLength);
      state.revisions[index] = block.revision;
      state.pendingWrites[index] = false;
    }
  }
};

/**
 * Pack `scalarValues` into `state.data` (reused across frames) and report
 * whether the packed bytes differ from the previous upload. Every slot writes
 * its four components - trailing components of a scalar/vec2/vec3 are zeroed -
 * so a uniform changing arity in place is handled correctly.
 *
 * `forceWrite` (the destination GPU buffer was just recreated and holds
 * undefined contents) always reports changed.
 */
export const packUserUniforms = (
  scalarValues: ReadonlyArray<Exclude<UniformValue, Texture | RenderTexture>>,
  state: UserUniformState,
  forceWrite: boolean,
): boolean => {
  const slotCount = Math.max(scalarValues.length, 1);
  const floatCount = slotCount * 4;

  // A shape change (slot count differs) always re-uploads: the previous mirror
  // no longer describes the same layout.
  let changed = forceWrite || state.floatCount !== floatCount;

  // Grow the scratch only when it cannot hold this frame's slots; a fresh array
  // starts zeroed and has no prior snapshot to diff against, so force the write.
  if (state.data.length < floatCount) {
    state.data = new Float32Array(floatCount);
    changed = true;
  }

  const data = state.data;
  let slot = 0;

  for (const value of scalarValues) {
    const base = slot * 4;
    let c0: number;
    let c1: number;
    let c2: number;
    let c3: number;

    if (typeof value === 'number') {
      c0 = value;
      c1 = 0;
      c2 = 0;
      c3 = 0;
    } else {
      // Float32Array | Int32Array | readonly number[] - all index-addressable;
      // the UBO slot holds at most a vec4, so only the first four are consumed.
      const arr = value as ArrayLike<number>;
      const length = arr.length;

      c0 = length > 0 ? arr[0]! : 0;
      c1 = length > 1 ? arr[1]! : 0;
      c2 = length > 2 ? arr[2]! : 0;
      c3 = length > 3 ? arr[3]! : 0;
    }

    if (data[base] !== c0) {
      data[base] = c0;
      changed = true;
    }
    if (data[base + 1] !== c1) {
      data[base + 1] = c1;
      changed = true;
    }
    if (data[base + 2] !== c2) {
      data[base + 2] = c2;
      changed = true;
    }
    if (data[base + 3] !== c3) {
      data[base + 3] = c3;
      changed = true;
    }

    slot++;
  }

  state.floatCount = floatCount;

  return changed;
};

/** Record every uniform buffer this material binds as read by the open pass. */
export const addUserUniformBuffersInPass = (state: UserUniformState, inPass: Set<GPUBuffer>): void => {
  for (let index = 0; index < state.buffers.length; index++) {
    const buffer = state.buffers[index];

    if (buffer !== null && buffer !== undefined) {
      inPass.add(buffer);
    }
  }
};

/**
 * Whether the planned write would land on a buffer a draw already recorded into
 * the open pass reads. `queue.writeBuffer` is ordered against the *submit*, not
 * against the individual draws inside it, so the earlier draw would sample this
 * batch's values. A buffer being replaced counts too: the apply step destroys
 * the outgrown one.
 */
export const userUniformWriteWouldAlias = (state: UserUniformState, inPass: ReadonlySet<GPUBuffer>): boolean => {
  for (let index = 0; index < state.buffers.length; index++) {
    const stale = state.pendingStale[index];

    if (stale !== null && stale !== undefined && inPass.has(stale)) {
      return true;
    }

    const buffer = state.buffers[index];

    if (state.pendingWrites[index] === true && buffer !== null && buffer !== undefined && inPass.has(buffer)) {
      return true;
    }
  }

  return false;
};

/**
 * The `@group(2)` layout entries a material needs: one uniform buffer per
 * uniform-buffer binding, then a texture/sampler pair per bound texture.
 *
 * The uniform bindings are unconditional even when the material declares no
 * values, so the layout is stable across user-uniform mutations and a
 * texture-only material still satisfies it.
 */
export const userUniformLayoutEntries = (material: AnyMaterial, textureCount: number): GPUBindGroupLayoutEntry[] => {
  const entries: GPUBindGroupLayoutEntry[] = [];
  const uniformBindings = userUniformBindingCount(material);

  for (let binding = 0; binding < uniformBindings; binding++) {
    entries.push({ binding, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } });
  }

  let bindingIndex = uniformBindings;

  for (let texture = 0; texture < textureCount; texture++) {
    entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
    bindingIndex++;
    entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
    bindingIndex++;
  }

  return entries;
};

/**
 * Build (or reuse) the custom material's `@group(2)` bind group: the uniform
 * buffers followed by texture/sampler pairs. Texture bindings are always
 * re-resolved (which syncs a mutated texture's content before sampling), and
 * the cached group is reused while every buffer identity and every resolved
 * view/sampler are unchanged - a static material then creates zero bind groups
 * per frame while a texture swap/resize rebuilds exactly once.
 */
export const resolveUserUniformBindGroup = (
  device: GPUDevice,
  backend: WebGpuBackend,
  material: AnyMaterial,
  layout: GPUBindGroupLayout,
  label: string,
  state: UserUniformState,
): GPUBindGroup => {
  const textures = collectTextureBindings(material);
  const views: GPUTextureView[] = [];
  const samplers: GPUSampler[] = [];
  const uniformBindings = userUniformBindingCount(material);

  // Resolve every binding first - this uploads a dirty texture's content to the
  // GPU before it is sampled, so it must run every frame even on a cache hit.
  for (const texture of textures) {
    const binding = backend.getTextureBinding(texture);

    views.push(binding.view);
    samplers.push(binding.sampler);
  }

  if (
    state.bindGroup !== null &&
    sameReferences(state.bindGroupBuffers, state.buffers) &&
    sameReferences(state.bindGroupViews, views) &&
    sameReferences(state.bindGroupSamplers, samplers)
  ) {
    return state.bindGroup;
  }

  const entries: GPUBindGroupEntry[] = [];

  for (let binding = 0; binding < uniformBindings; binding++) {
    entries.push({ binding, resource: { buffer: state.buffers[binding]! } });
  }

  let bindingIndex = uniformBindings;

  for (let i = 0; i < textures.length; i++) {
    entries.push({ binding: bindingIndex, resource: views[i]! });
    bindingIndex++;
    entries.push({ binding: bindingIndex, resource: samplers[i]! });
    bindingIndex++;
  }

  const group = device.createBindGroup({ label, layout, entries });

  state.bindGroup = group;
  state.bindGroupBuffers = [...state.buffers];
  state.bindGroupViews = views;
  state.bindGroupSamplers = samplers;

  return group;
};

const sameReferences = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
};
