/// <reference types="@webgpu/types" />

/**
 * Owning wrapper around a `GPUBuffer` allocated with `UNIFORM | COPY_DST`,
 * plus any `extraUsage` flags passed at construction. Counterpart to
 * {@link WebGpuStorageBuffer} for the uniform-buffer case - deliberately
 * simpler (no readback support): uniform buffers are CPU→GPU config data,
 * written every frame and read by shaders, essentially never read back.
 *
 * Lifetime: the caller owns the buffer and must call {@link destroy} when
 * the system is torn down.
 */
export class WebGpuUniformBuffer {
  public readonly device: GPUDevice;
  public readonly buffer: GPUBuffer;
  public readonly byteLength: number;
  public readonly label: string;

  public constructor(device: GPUDevice, byteLength: number, label = 'uniform', extraUsage: GPUBufferUsageFlags = 0) {
    this.device = device;
    this.byteLength = byteLength;
    this.label = label;
    this.buffer = device.createBuffer({
      label,
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | extraUsage,
    });
  }

  /** Upload the contents of `data` to this buffer at `byteOffset`. */
  public write(data: ArrayBufferView, byteOffset = 0, byteSize?: number): void {
    this.device.queue.writeBuffer(this.buffer, byteOffset, data.buffer, data.byteOffset, byteSize ?? data.byteLength);
  }

  public destroy(): void {
    this.buffer.destroy();
  }
}
