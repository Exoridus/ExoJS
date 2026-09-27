import type { WebGpuRetainedBatchPayload } from './retainedGroupResources';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';

export interface WebGpuNativeRetainedReplayFrame {
  readonly id: number;
  remainingBuilds: number;
}

interface NativeEntry {
  readonly device: GPUDevice;
  readonly colorFormat: GPUTextureFormat;
  readonly pipeline: GPURenderPipeline;
  readonly group0: GPUBindGroup;
  readonly group1: GPUBindGroup;
  readonly group2: GPUBindGroup | null;
  readonly vertexBuffer: GPUBuffer;
  readonly byteOffset: number;
  readonly indexBuffer: GPUBuffer;
  readonly indexFormat: GPUIndexFormat;
  readonly indexCount: number;
  readonly instanceCount: number;
  seenFrame: number;
  bundles: GPURenderBundle[] | null;
}

/** Group-owned acceleration for stable retained draws; false leaves encoding to the caller. */
export class WebGpuNativeRetainedReplay {
  private readonly _entries = new Map<WebGpuRetainedBatchPayload, NativeEntry>();
  private _frame: WebGpuNativeRetainedReplayFrame | null = null;
  private _lastFrame = -1;
  private _observationFrame = -1;
  private _stableFrames = 0;
  private _seenCount = 0;

  public beginFrame(frame: WebGpuNativeRetainedReplayFrame): void {
    if (frame.id !== this._lastFrame) {
      if (frame.id !== this._lastFrame + 1 || this._seenCount !== this._entries.size) {
        this.invalidate();
      } else if (this._entries.size >= 32) {
        this._stableFrames++;
      }

      this._seenCount = 0;
      this._lastFrame = frame.id;
    }

    this._frame = frame;
  }

  /** Drops references to recorded commands and restarts stability observation. */
  public invalidate(): void {
    this._entries.clear();
    this._observationFrame = -1;
    this._stableFrames = 0;
    this._seenCount = 0;
  }

  public draw(
    device: GPUDevice,
    activePass: WebGpuActiveRenderPass,
    payload: WebGpuRetainedBatchPayload,
    colorFormat: GPUTextureFormat,
    pipeline: GPURenderPipeline,
    group0: GPUBindGroup,
    group1: GPUBindGroup,
    indexBuffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    indexCount: number,
    instanceCount: number,
    group2: GPUBindGroup | null = null,
  ): boolean {
    const frame = this._frame;
    const vertexBuffer = payload.bundle.instanceBuffer;

    if (frame === null || vertexBuffer === null || activePass.stencilEnabled || activePass.depthWrites) {
      this.invalidate();
      return false;
    }

    let entry = this._entries.get(payload);

    if (
      entry !== undefined &&
      (entry.device !== device ||
        entry.colorFormat !== colorFormat ||
        entry.pipeline !== pipeline ||
        entry.group0 !== group0 ||
        entry.group1 !== group1 ||
        entry.group2 !== group2 ||
        entry.vertexBuffer !== vertexBuffer ||
        entry.byteOffset !== payload.byteOffset ||
        entry.indexBuffer !== indexBuffer ||
        entry.indexFormat !== indexFormat ||
        entry.indexCount !== indexCount ||
        entry.instanceCount !== instanceCount)
    ) {
      this.invalidate();
      entry = undefined;
    }

    if (entry === undefined) {
      // The first observed frame establishes the complete batch set. Later additions
      // invalidate that set so partial or changing replays never accumulate age.
      if (this._observationFrame !== -1 && this._observationFrame !== this._lastFrame) this.invalidate();
      this._observationFrame = this._lastFrame;
      entry = {
        device,
        colorFormat,
        pipeline,
        group0,
        group1,
        group2,
        vertexBuffer,
        byteOffset: payload.byteOffset,
        indexBuffer,
        indexFormat,
        indexCount,
        instanceCount,
        seenFrame: this._lastFrame,
        bundles: null,
      };
      this._entries.set(payload, entry);
      this._seenCount++;
      return false;
    }

    if (entry.seenFrame !== this._lastFrame) {
      entry.seenFrame = this._lastFrame;
      this._seenCount++;
    }

    if (this._stableFrames < 30 || this._entries.size < 32) return false;

    if (entry.bundles === null) {
      if (frame.remainingBuilds <= 0) return false;
      frame.remainingBuilds--;

      const encoder = device.createRenderBundleEncoder({ colorFormats: [colorFormat] });
      encoder.setPipeline(pipeline);
      encoder.setBindGroup(0, group0);
      encoder.setBindGroup(1, group1);
      if (group2 !== null) encoder.setBindGroup(2, group2);
      encoder.setVertexBuffer(0, vertexBuffer, payload.byteOffset);
      encoder.setIndexBuffer(indexBuffer, indexFormat);
      encoder.drawIndexed(indexCount, instanceCount);
      entry.bundles = [encoder.finish()];
    }

    activePass.pass.executeBundles(entry.bundles);
    return true;
  }
}
