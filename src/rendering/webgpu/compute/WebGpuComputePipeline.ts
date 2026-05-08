/// <reference types="@webgpu/types" />

/**
 * Description of a single buffer binding for a compute pipeline. Mirrors
 * the WGSL `@group(0) @binding(N)` declaration.
 *
 * `binding` matches the WGSL binding number; `type` chooses the storage
 * mode. `'storage'` is read-write (`var<storage, read_write>` in WGSL),
 * `'storage-read'` is read-only (`var<storage, read>`), `'uniform'` is
 * read-only and aligned to 16 bytes (`var<uniform>`).
 */
export interface ComputeBinding {
  binding: number;
  type: 'storage' | 'storage-read' | 'uniform';
}

/**
 * Owning wrapper around a `GPUComputePipeline` plus its bind-group layout.
 * Created once per shader; multiple bind groups can be bound per dispatch
 * to render different particle systems with the same pipeline.
 *
 * Construct via {@link create}; do not call `new GPUComputePipeline`
 * directly elsewhere.
 */
export class WebGpuComputePipeline {
  public readonly device: GPUDevice;
  public readonly pipeline: GPUComputePipeline;
  public readonly bindGroupLayout: GPUBindGroupLayout;
  public readonly workgroupSize: number;

  public constructor(device: GPUDevice, pipeline: GPUComputePipeline, bindGroupLayout: GPUBindGroupLayout, workgroupSize: number) {
    this.device = device;
    this.pipeline = pipeline;
    this.bindGroupLayout = bindGroupLayout;
    this.workgroupSize = workgroupSize;
  }

  public static create(
    device: GPUDevice,
    opts: {
      wgsl: string;
      entryPoint?: string;
      workgroupSize?: number;
      bindings: readonly ComputeBinding[];
      label?: string;
    },
  ): WebGpuComputePipeline {
    const workgroupSize = opts.workgroupSize ?? 64;
    const entryPoint = opts.entryPoint ?? 'main';
    const label = opts.label ?? 'compute';

    const bindGroupLayout = device.createBindGroupLayout({
      label: `${label}-bgl`,
      entries: opts.bindings.map(b => {
        let bufferType: GPUBufferBindingType = 'read-only-storage';
        if (b.type === 'uniform') {
          bufferType = 'uniform';
        } else if (b.type === 'storage') {
          bufferType = 'storage';
        }
        return {
          binding: b.binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: bufferType,
          },
        };
      }),
    });

    const pipelineLayout = device.createPipelineLayout({
      label: `${label}-layout`,
      bindGroupLayouts: [bindGroupLayout],
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

    return new WebGpuComputePipeline(device, pipeline, bindGroupLayout, workgroupSize);
  }

  /**
   * Construct a bind group from `entries` in the order matching the
   * binding indices declared at pipeline creation. The caller is
   * responsible for the buffers' lifecycle.
   */
  public createBindGroup(entries: ReadonlyArray<{ binding: number; buffer: GPUBuffer; offset?: number; size?: number }>, label?: string): GPUBindGroup {
    return this.device.createBindGroup({
      label: label ?? 'compute-bg',
      layout: this.bindGroupLayout,
      entries: entries.map(e => ({
        binding: e.binding,
        resource: {
          buffer: e.buffer,
          offset: e.offset ?? 0,
          size: e.size,
        },
      })),
    });
  }

  /**
   * Dispatch this pipeline over `itemCount` items. Workgroups dispatched
   * = `ceil(itemCount / workgroupSize)`. Caller must have set the bind
   * group on the pass already.
   */
  public dispatch(passEncoder: GPUComputePassEncoder, itemCount: number): void {
    if (itemCount <= 0) {
      return;
    }

    const workgroups = Math.ceil(itemCount / this.workgroupSize);

    passEncoder.dispatchWorkgroups(workgroups);
  }
}
