/// <reference types="@webgpu/types" />

/**
 * Description of a single buffer binding for a compute pipeline. Mirrors
 * the WGSL `@group(N) @binding(M)` declaration.
 *
 * `binding` matches the WGSL binding number; `type` chooses the storage
 * mode. `'storage'` is read-write (`var<storage, read_write>` in WGSL),
 * `'storage-read'` is read-only (`var<storage, read>`), `'uniform'` is
 * read-only and aligned to 16 bytes (`var<uniform>`).
 */
export interface ComputeBufferBinding {
  readonly kind: 'buffer';
  readonly binding: number;
  readonly type: 'storage' | 'storage-read' | 'uniform';
}

/** Compute-visible sampled-texture binding (e.g. a 1D lookup table). */
export interface ComputeTextureBinding {
  readonly kind: 'texture';
  readonly binding: number;
  readonly viewDimension: GPUTextureViewDimension;
  readonly sampleType: GPUTextureSampleType;
}

/** Compute-visible sampler binding, paired with a {@link ComputeTextureBinding}. */
export interface ComputeSamplerBinding {
  readonly kind: 'sampler';
  readonly binding: number;
  readonly type: GPUSamplerBindingType;
}

/**
 * Compute-visible storage-texture binding (a shader writes into it directly,
 * unlike {@link ComputeTextureBinding} which is sampled/read-only).
 *
 * `'write-only'` is broadly supported in core WebGPU. `'read-only'` and
 * `'read-write'` access are a newer core-feature addition and NOT
 * guaranteed available on every backend/browser — check
 * `device.features.has(...)`/the relevant capability before requesting
 * anything other than `'write-only'`, and prefer it unless the shader
 * genuinely needs to read back what it wrote within the same dispatch.
 */
export interface ComputeStorageTextureBinding {
  readonly kind: 'storageTexture';
  readonly binding: number;
  readonly access: GPUStorageTextureAccess;
  readonly format: GPUTextureFormat;
  readonly viewDimension?: GPUTextureViewDimension;
}

/** One binding within a compute pipeline's bind-group layout. */
export type ComputeBinding = ComputeBufferBinding | ComputeTextureBinding | ComputeSamplerBinding | ComputeStorageTextureBinding;

/** Resource to bind at `binding` when building a bind group via {@link WebGpuComputePipeline.createBindGroup}. */
export type ComputeBindGroupEntry =
  | { readonly binding: number; readonly buffer: GPUBuffer; readonly offset?: number; readonly size?: number }
  | { readonly binding: number; readonly textureView: GPUTextureView }
  | { readonly binding: number; readonly sampler: GPUSampler };

const toLayoutEntry = (b: ComputeBinding): GPUBindGroupLayoutEntry => {
  if (b.kind === 'texture') {
    return { binding: b.binding, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: b.viewDimension, sampleType: b.sampleType } };
  }

  if (b.kind === 'sampler') {
    return { binding: b.binding, visibility: GPUShaderStage.COMPUTE, sampler: { type: b.type } };
  }

  if (b.kind === 'storageTexture') {
    return {
      binding: b.binding,
      visibility: GPUShaderStage.COMPUTE,
      storageTexture: { access: b.access, format: b.format, ...(b.viewDimension !== undefined && { viewDimension: b.viewDimension }) },
    };
  }

  let bufferType: GPUBufferBindingType = 'read-only-storage';

  if (b.type === 'uniform') {
    bufferType = 'uniform';
  } else if (b.type === 'storage') {
    bufferType = 'storage';
  }

  return { binding: b.binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: bufferType } };
};

const toGroupEntry = (e: ComputeBindGroupEntry): GPUBindGroupEntry => {
  if ('textureView' in e) {
    return { binding: e.binding, resource: e.textureView };
  }

  if ('sampler' in e) {
    return { binding: e.binding, resource: e.sampler };
  }

  return { binding: e.binding, resource: { buffer: e.buffer, offset: e.offset ?? 0, ...(e.size !== undefined && { size: e.size }) } };
};

/**
 * Owning wrapper around a `GPUComputePipeline` plus its bind-group layouts —
 * one layout per declared group (`@group(0)`, `@group(1)`, ... in
 * declaration order). Created once per shader; multiple bind groups can be
 * built per layout and swapped across dispatches (e.g. to run the same
 * pipeline against different data sets).
 *
 * Construct via {@link create}; do not call `new GPUComputePipeline`
 * directly elsewhere.
 */
export class WebGpuComputePipeline {
  public readonly device: GPUDevice;
  public readonly pipeline: GPUComputePipeline;
  public readonly bindGroupLayouts: readonly GPUBindGroupLayout[];
  public readonly workgroupSize: number;

  public constructor(device: GPUDevice, pipeline: GPUComputePipeline, bindGroupLayouts: readonly GPUBindGroupLayout[], workgroupSize: number) {
    this.device = device;
    this.pipeline = pipeline;
    this.bindGroupLayouts = bindGroupLayouts;
    this.workgroupSize = workgroupSize;
  }

  public static create(
    device: GPUDevice,
    opts: {
      wgsl: string;
      entryPoint?: string;
      workgroupSize?: number;
      bindingGroups: ReadonlyArray<readonly ComputeBinding[]>;
      label?: string;
    },
  ): WebGpuComputePipeline {
    const workgroupSize = opts.workgroupSize ?? 64;
    const entryPoint = opts.entryPoint ?? 'main';
    const label = opts.label ?? 'compute';

    const bindGroupLayouts = opts.bindingGroups.map((bindings, groupIndex) =>
      device.createBindGroupLayout({
        label: `${label}-bgl${groupIndex}`,
        entries: bindings.map(toLayoutEntry),
      }),
    );

    const pipelineLayout = device.createPipelineLayout({
      label: `${label}-layout`,
      bindGroupLayouts,
    });

    const module = device.createShaderModule({
      label: `${label}-shader`,
      code: opts.wgsl,
    });

    const pipeline = device.createComputePipeline({
      label,
      layout: pipelineLayout,
      compute: {
        module,
        entryPoint,
      },
    });

    return new WebGpuComputePipeline(device, pipeline, bindGroupLayouts, workgroupSize);
  }

  /**
   * Build a bind group for group `groupIndex` (matching its position in
   * {@link create}'s `bindingGroups`) from `entries`. The caller is
   * responsible for the bound resources' lifecycle.
   */
  public createBindGroup(groupIndex: number, entries: readonly ComputeBindGroupEntry[], label?: string): GPUBindGroup {
    return this.device.createBindGroup({
      label: label ?? `compute-bg${groupIndex}`,
      layout: this.bindGroupLayouts[groupIndex]!,
      entries: entries.map(toGroupEntry),
    });
  }

  private _bind(passEncoder: GPUComputePassEncoder, bindGroups: readonly GPUBindGroup[]): void {
    passEncoder.setPipeline(this.pipeline);

    for (let i = 0; i < bindGroups.length; i++) {
      passEncoder.setBindGroup(i, bindGroups[i]);
    }
  }

  /**
   * Set this pipeline, bind `bindGroups` at their array index, and dispatch
   * a 1D workgroup grid sized for `itemCount` independent items — workgroups
   * dispatched = `ceil(itemCount / workgroupSize)`. No-ops when `itemCount
   * <= 0`. The common case for "N independent items, one thread per item".
   */
  public dispatch(passEncoder: GPUComputePassEncoder, itemCount: number, bindGroups: readonly GPUBindGroup[] = []): void {
    if (itemCount <= 0) {
      return;
    }

    this._bind(passEncoder, bindGroups);

    const workgroups = Math.ceil(itemCount / this.workgroupSize);

    passEncoder.dispatchWorkgroups(workgroups);
  }

  /**
   * Set this pipeline, bind `bindGroups`, and dispatch `x`×`y`×`z` workgroups
   * directly — no item-count derivation. Use for 2D/3D compute problems (e.g.
   * per-texel image processing); use {@link dispatch} for the 1D
   * "N independent items" case instead, since the two take different units
   * (workgroup counts here vs. item counts there).
   */
  public dispatchWorkgroups(passEncoder: GPUComputePassEncoder, x: number, y = 1, z = 1, bindGroups: readonly GPUBindGroup[] = []): void {
    this._bind(passEncoder, bindGroups);
    passEncoder.dispatchWorkgroups(x, y, z);
  }

  /**
   * Set this pipeline, bind `bindGroups`, and dispatch indirectly: workgroup
   * counts are read from `indirectBuffer` at `indirectOffset` (3× `u32`,
   * x/y/z) instead of being supplied by the caller. Use when the dispatch
   * size is only known GPU-side — e.g. a prior compute pass writes a
   * survivor count after culling/compaction. `indirectBuffer` must have been
   * created with `GPUBufferUsage.INDIRECT` (plus `STORAGE` if a compute
   * shader is what writes the counts into it).
   */
  public dispatchIndirect(passEncoder: GPUComputePassEncoder, indirectBuffer: GPUBuffer, indirectOffset: number, bindGroups: readonly GPUBindGroup[] = []): void {
    this._bind(passEncoder, bindGroups);
    passEncoder.dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset);
  }
}
