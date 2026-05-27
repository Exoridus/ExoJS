import type { DrawCommand } from '@/rendering/plan/RenderCommand';
import { TransformBuffer } from '@/rendering/TransformBuffer';

const slotFloatCount = 12;

/** @internal */
export class WebGpuTransformStorage {
  private readonly _buffer = new TransformBuffer();
  private _storageBuffer: GPUBuffer | null = null;
  private _storageCapacity = 0;
  private _storageHash = 0;
  private _storageCount = -1;

  public begin(nodeCount: number): void {
    this._buffer.begin(nodeCount);
  }

  public writeCommand(command: DrawCommand): void {
    const drawable = command.drawable;

    this._buffer.write(command.nodeIndex, drawable.getGlobalTransform(), drawable.tint);
  }

  public getBuffer(device: GPUDevice, minCount: number): { readonly buffer: GPUBuffer; readonly count: number } {
    const requiredCount = Math.max(1, minCount);
    const requiredBytes = requiredCount * slotFloatCount * Float32Array.BYTES_PER_ELEMENT;
    const snapshot = this._buffer.commitSnapshot(requiredCount);

    if (this._storageBuffer === null || requiredBytes > this._storageCapacity) {
      let nextCapacity = Math.max(this._storageCapacity, slotFloatCount * Float32Array.BYTES_PER_ELEMENT);

      while (nextCapacity < requiredBytes) {
        nextCapacity *= 2;
      }

      this._storageBuffer?.destroy();
      this._storageBuffer = device.createBuffer({
        size: nextCapacity,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this._storageCapacity = nextCapacity;
      this._storageHash = 0;
      this._storageCount = -1;
    }

    if (snapshot.changed || snapshot.hash !== this._storageHash || snapshot.count !== this._storageCount) {
      const bytes = snapshot.count * slotFloatCount * Float32Array.BYTES_PER_ELEMENT;

      device.queue.writeBuffer(this._storageBuffer, 0, this._buffer.data.buffer, this._buffer.data.byteOffset, bytes);
      this._storageHash = snapshot.hash;
      this._storageCount = snapshot.count;
    }

    return {
      buffer: this._storageBuffer,
      count: snapshot.count,
    };
  }

  public destroy(): void {
    this._storageBuffer?.destroy();
    this._storageBuffer = null;
    this._storageCapacity = 0;
    this._storageHash = 0;
    this._storageCount = -1;
  }
}

