/// <reference types="@webgpu/types" />

import { isTextureUniformValue, type Material, type UniformValue } from '#rendering/material/Material';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import type { WebGpuBackend } from './WebGpuBackend';

/**
 * Shared user-uniform handling for the WebGPU custom-material paths
 * (WebGpuSpriteRenderer / WebGpuMeshRenderer group(2)).
 *
 * The two renderers pack an identical `@group(2)` layout — one UBO at binding 0
 * followed by texture/sampler pairs — so the packing, change-detection, and
 * bind-group caching live here to keep them byte-for-byte consistent.
 *
 * The core contract: the per-material UBO scratch and its GPU
 * bind group are reused across frames and re-uploaded/rebuilt only when the
 * material's uniform VALUES (or bound texture views) actually change — a static
 * custom-material scene then issues zero uniform writes and zero bind-group
 * creations per frame instead of one of each per flush.
 * @internal
 */

/** Whether a uniform value is a bound texture rather than a scalar/vector. */
export function isTextureUniform(value: UniformValue): value is Texture | RenderTexture {
  return isTextureUniformValue(value);
}

/** Scalar/vector/matrix uniforms (texture values excluded) in declaration order. */
export function collectScalarUniforms(material: Material): Array<Exclude<UniformValue, Texture | RenderTexture>> {
  const result: Array<Exclude<UniformValue, Texture | RenderTexture>> = [];

  for (const name of material._bindingSchema.scalarUniformNames) {
    result.push(material._getUniformValue(name) as Exclude<UniformValue, Texture | RenderTexture>);
  }

  return result;
}

/**
 * Texture bindings claimed by the material, in a stable order: texture-valued
 * entries of `uniforms` first (declaration order), then the dedicated
 * `textures` map (declaration order). The WGSL source must declare its
 * `@group(2)` texture/sampler pairs in this same order.
 */
export function collectTextureBindings(material: Material): Array<Texture | RenderTexture> {
  const result: Array<Texture | RenderTexture> = [];

  for (const name of material._bindingSchema.textureUniformNames) {
    result.push(material._getUniformValue(name) as Texture | RenderTexture);
  }

  for (const name of material._bindingSchema.textureNames) {
    result.push(material._getTextureValue(name));
  }

  return result;
}

/**
 * Persistent, per-material cache for a custom material's `@group(2)` resources.
 * Reused across frames; recreated wholesale when its owning material resource
 * bundle is (re)built on reconnect so a lost device never keeps stale handles.
 */
export interface UserUniformState {
  /** CPU mirror of the UBO's last-uploaded contents; reused across frames. */
  data: Float32Array;
  /** Float count populated on the last upload; `-1` before the first upload. */
  floatCount: number;
  /** Cached user bind group, or `null` before the first build / after an invalidation. */
  bindGroup: GPUBindGroup | null;
  /** UBO identity the cached bind group binds — a new buffer invalidates it. */
  bindGroupBuffer: GPUBuffer | null;
  /** Texture views the cached bind group binds — a refreshed view invalidates it. */
  bindGroupViews: GPUTextureView[];
  /** Samplers the cached bind group binds — a refreshed sampler invalidates it. */
  bindGroupSamplers: GPUSampler[];
}

/**
 * What one batch is about to do to a material's user-uniform buffer, decided
 * before anything is recorded into the open render pass.
 *
 * The upload is split into a plan and an apply step because the write is a
 * hazard, not a detail: it lands on the queue timeline ahead of the whole
 * submit, so a draw already recorded into the open pass would read this batch's
 * values instead of its own. The caller answers that with its pass, then
 * applies — see {@link planUserUniformUpload} and {@link applyUserUniformUpload}.
 */
export interface UserUniformUpload {
  /** The buffer this batch binds, freshly created when the previous one was too small. */
  readonly buffer: GPUBuffer;
  /** Whether the packed bytes differ from what `buffer` already holds. */
  readonly writes: boolean;
  /** Byte length the write covers, starting at offset 0. */
  readonly byteLength: number;
  /** The outgrown buffer this upload replaces, destroyed by the apply step. */
  readonly staleBuffer: GPUBuffer | null;
}

/** The subset of a material's cached GPU resources this module owns. */
export interface UserUniformResources {
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  readonly userUniform: UserUniformState;
}

/**
 * Pack `material`'s scalar uniforms and decide what the upload needs, without
 * touching the queue: the returned {@link UserUniformUpload} says which buffer
 * the batch binds and whether the bytes must be re-uploaded at all. A material
 * whose values did not change since its last upload writes nothing.
 *
 * A buffer that outgrew its capacity is replaced here but the old one is NOT
 * destroyed yet — it may still be read by a draw in the open pass, and the
 * caller needs {@link UserUniformUpload.staleBuffer} to see that before
 * {@link applyUserUniformUpload} frees it.
 */
export function planUserUniformUpload(material: Material, resources: UserUniformResources, device: GPUDevice, label: string): UserUniformUpload {
  const scalarValues = collectScalarUniforms(material);
  // Always keep a UBO (even if empty) since binding 0 of the user layout is
  // fixed, with WebGPU's 16-byte minimum as the floor.
  const byteLength = userUniformBufferBytes(scalarValues.length);
  const needsNewBuffer = resources.userUniformBuffer === null || resources.userUniformBufferCapacity < byteLength;
  let staleBuffer: GPUBuffer | null = null;

  if (needsNewBuffer) {
    staleBuffer = resources.userUniformBuffer;
    resources.userUniformBufferCapacity = byteLength;
    resources.userUniformBuffer = device.createBuffer({
      label,
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // A fresh buffer holds undefined contents and voids any bind group that
    // referenced the old identity.
    resources.userUniform.bindGroup = null;
    resources.userUniform.bindGroupBuffer = null;
  }

  return {
    buffer: resources.userUniformBuffer!,
    // A recreated buffer holds undefined contents, so it always writes.
    writes: packUserUniforms(scalarValues, resources.userUniform, needsNewBuffer),
    byteLength,
    staleBuffer,
  };
}

/** Free the outgrown buffer and upload the packed bytes, once the pass is settled. */
export function applyUserUniformUpload(upload: UserUniformUpload, resources: UserUniformResources, device: GPUDevice): void {
  upload.staleBuffer?.destroy();

  if (upload.writes) {
    const data = resources.userUniform.data;

    device.queue.writeBuffer(upload.buffer, 0, data.buffer, data.byteOffset, upload.byteLength);
  }
}

/** Fresh, empty {@link UserUniformState} for a newly created material resource bundle. */
export function createUserUniformState(): UserUniformState {
  return {
    data: new Float32Array(0),
    floatCount: -1,
    bindGroup: null,
    bindGroupBuffer: null,
    bindGroupViews: [],
    bindGroupSamplers: [],
  };
}

/** Drop every cached handle so a device-loss teardown never keeps stale GPU objects. */
export function resetUserUniformState(state: UserUniformState): void {
  state.data = new Float32Array(0);
  state.floatCount = -1;
  state.bindGroup = null;
  state.bindGroupBuffer = null;
  state.bindGroupViews = [];
  state.bindGroupSamplers = [];
}

/**
 * Bytes required to hold `scalarCount` material uniforms — each occupies one
 * `≤vec4` 16-byte slot, with a minimum of one slot to satisfy WebGPU's minimum
 * uniform-buffer size.
 */
export function userUniformBufferBytes(scalarCount: number): number {
  return Math.max(scalarCount, 1) * 16;
}

/**
 * Pack `scalarValues` into `state.data` (reused across frames) and report
 * whether the packed bytes differ from the previous upload. Every slot writes
 * its four components — trailing components of a scalar/vec2/vec3 are zeroed —
 * so a uniform changing arity in place is handled correctly.
 *
 * `forceWrite` (the destination GPU buffer was just recreated and holds
 * undefined contents) always reports changed. On `true`, the caller uploads
 * `state.data` over `[0, {@link userUniformBufferBytes}(scalarValues.length))`.
 */
export function packUserUniforms(
  scalarValues: ReadonlyArray<Exclude<UniformValue, Texture | RenderTexture>>,
  state: UserUniformState,
  forceWrite: boolean,
): boolean {
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
      // Float32Array | Int32Array | readonly number[] — all index-addressable;
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
}

/**
 * Build (or reuse) the custom material's `@group(2)` bind group: the user UBO
 * at binding 0 followed by texture/sampler pairs. Texture bindings are always
 * re-resolved (which syncs a mutated texture's content before sampling), and
 * the cached group is reused while the UBO identity and every resolved
 * view/sampler are unchanged — a static material then creates zero bind groups
 * per frame while a texture swap/resize rebuilds exactly once.
 */
export function resolveUserUniformBindGroup(
  device: GPUDevice,
  backend: WebGpuBackend,
  material: Material,
  layout: GPUBindGroupLayout,
  label: string,
  uniformBuffer: GPUBuffer,
  state: UserUniformState,
): GPUBindGroup {
  const textures = collectTextureBindings(material);
  const views: GPUTextureView[] = [];
  const samplers: GPUSampler[] = [];

  // Resolve every binding first — this uploads a dirty texture's content to the
  // GPU before it is sampled, so it must run every frame even on a cache hit.
  for (const texture of textures) {
    const binding = backend.getTextureBinding(texture);

    views.push(binding.view);
    samplers.push(binding.sampler);
  }

  if (
    state.bindGroup !== null &&
    state.bindGroupBuffer === uniformBuffer &&
    sameReferences(state.bindGroupViews, views) &&
    sameReferences(state.bindGroupSamplers, samplers)
  ) {
    return state.bindGroup;
  }

  const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: uniformBuffer } }];
  let bindingIndex = 1;

  for (let i = 0; i < textures.length; i++) {
    entries.push({ binding: bindingIndex, resource: views[i]! });
    bindingIndex++;
    entries.push({ binding: bindingIndex, resource: samplers[i]! });
    bindingIndex++;
  }

  const group = device.createBindGroup({ label, layout, entries });

  state.bindGroup = group;
  state.bindGroupBuffer = uniformBuffer;
  state.bindGroupViews = views;
  state.bindGroupSamplers = samplers;

  return group;
}

function sameReferences(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}
