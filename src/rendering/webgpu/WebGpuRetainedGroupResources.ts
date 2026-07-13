/// <reference types="@webgpu/types" />

import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import type { RetainedBatchInstruction, RetainedGroupBundle, RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import type { WebGpuSpriteRenderer } from './WebGpuSpriteRenderer';

/** Bytes of one transform slot (3 × vec4<f32>, matches the WGSL `TransformSlot`). */
export const retainedTransformSlotBytes = 48;

/** Bytes of the per-group uniform buffer (projection mat4 + group mat4, S3-D7). */
export const retainedGroupUniformBytes = 128;

/**
 * Backend-owned replay descriptor for one recorded sprite flush (Track B
 * Slice 3, S3-D1). Carried as the opaque `payload` of a
 * {@link RetainedBatchInstruction}; everything here is DATA — all state
 * (pipeline, projection/group uniforms, texture bindings) is resolved live at
 * replay by {@link WebGpuSpriteRenderer._replayRecordedSpriteBatch}.
 * @internal
 */
export interface WebGpuRetainedBatchPayload {
  /** The sprite renderer that recorded (and replays) this batch. */
  readonly renderer: WebGpuSpriteRenderer;
  /** The bundle whose group-owned buffers hold this batch's data. */
  readonly bundle: WebGpuRetainedGroupBundle;
  /** Byte offset of this batch's instances inside the bundle's instance buffer. */
  readonly byteOffset: number;
  readonly instanceCount: number;
  readonly blendMode: BlendModes;
  /** Slot-ordered batch textures; bind group(1) is re-resolved live from these. */
  readonly textures: ReadonlyArray<Texture | RenderTexture>;
  /**
   * The managed texture views at record time, parallel to {@link textures}.
   * Collect-time validation (S3-D3) compares them against the live managed
   * views: `_syncTexture` recreates the view on RESIZE, and resized textures
   * invalidate the recorded UV words — so a view-identity mismatch must force
   * a recapture, never a replay.
   */
  readonly recordedViews: readonly GPUTextureView[];
}

/** One sprite flush staged during a capture window, finalized at capture end. @internal */
export interface WebGpuStagedRetainedBatch {
  /** CPU copy of the packed instance bytes (word 8 rebased at capture end). */
  readonly bytes: Uint8Array;
  /** Byte offset assigned inside the owning bundle's instance buffer. */
  readonly byteOffset: number;
  /** Lowest frame-global transform row referenced by the bytes. */
  readonly minNodeIndex: number;
  /** Highest frame-global transform row referenced by the bytes. */
  readonly maxNodeIndex: number;
  /**
   * Created with `retainedGenerationUnstamped` at flush time and stamped via
   * `stampRetainedBatchGeneration` at capture end, after the bundle's
   * grow-only buffers are finalized — growth bumps the generation, so
   * stamping earlier would self-invalidate the set.
   */
  readonly instruction: RetainedBatchInstruction;
}

/**
 * Active capture window for one retained group (stacked for nesting, S3-D6):
 * batches flushed while this frame is on the backend's stack are staged here
 * (bytes stored once, owned by the INNERMOST frame's bundle) and their
 * instructions appended to every active set.
 * @internal
 */
export class WebGpuRetainedCaptureFrame {
  public readonly set: RetainedInstructionSet;
  public readonly bundle: WebGpuRetainedGroupBundle;
  public readonly staged: WebGpuStagedRetainedBatch[] = [];
  public totalBytes = 0;
  /**
   * Set when playback inside the window issued work the recorder cannot
   * replay (non-recordable renderer, custom material, compositor). Should be
   * unreachable — the collect-time recordability predicate (S3-D5) excludes
   * all of it — but wrong pixels are never an acceptable failure mode, so a
   * poisoned window is dropped and its set permanently vetoed.
   */
  public poisoned = false;

  public constructor(set: RetainedInstructionSet, bundle: WebGpuRetainedGroupBundle) {
    this.set = set;
    this.bundle = bundle;
  }
}

/**
 * Group-owned GPU resources for one retained group on the WebGPU backend
 * (Track B Slice 3, S3-D4/S3-D7):
 *
 * - an instance VERTEX buffer holding the recorded batch bytes (node indices
 *   rebased group-local),
 * - a STORAGE buffer holding the group's transform rows `[0, N)`,
 * - a 128-byte uniform buffer with the same `ProjectionUniforms` layout as
 *   the shared sprite UBO (projection mat4 + group mat4) so the existing
 *   bind-group(0) layout — and therefore every existing pipeline — is reused
 *   as-is at replay,
 * - one cached bind group(0) pairing the two.
 *
 * Buffers are grow-only across recaptures (S3-D3 — no realloc churn under
 * motion-stop/start). {@link generation} bumps whenever GPU resources are
 * recreated or dropped (growth, device loss, destroy); instruction sets
 * stamped with an older generation fail plan-level validation and fall back
 * to entry replay.
 * @internal
 */
export class WebGpuRetainedGroupBundle implements RetainedGroupBundle {
  private _generation = 1;
  private _instanceBuffer: GPUBuffer | null = null;
  private _instanceCapacity = 0;
  private _transformBuffer: GPUBuffer | null = null;
  private _transformCapacity = 0;
  // Slice 4c in-place patch state: the shared-buffer row the stored rows were
  // rebased from, how many rows the store currently holds (bounds guard), and
  // the device whose queue the sub-range write goes through. All set at capture
  // finalize; cleared on device loss so a late patch cannot touch a dead buffer.
  private _transformRowBase = 0;
  private _transformRowCount = 0;
  private _patchDevice: GPUDevice | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _bindGroupLayout: GPUBindGroupLayout | null = null;
  private readonly _accountant: GpuResourceAccountant;
  private _accountedBytes = 0;
  private _onRelease: ((bundle: WebGpuRetainedGroupBundle) => void) | null;

  // ── Replay-time uniform tracking (S3-D7) ─────────────────────────────────
  // The 128-byte mirror of the group UBO (projection at [0,16), group matrix
  // at [16,32)) plus the (view, updateId) it was written for. Replays skip
  // the writeBuffer while the content is unchanged; a content change while
  // the OPEN pass already holds this bundle's replayed draws is the same-
  // frame double-replay hazard and ends the pass first.
  public readonly uboData = new Float32Array(retainedGroupUniformBytes / Float32Array.BYTES_PER_ELEMENT);
  public uboWritten = false;
  public uboView: View | null = null;
  public uboViewUpdateId = -1;
  /** The open pass this bundle's replayed draws were last recorded into. */
  public drawsInPass: WebGpuActiveRenderPass | null = null;

  public constructor(accountant: GpuResourceAccountant, onRelease: (bundle: WebGpuRetainedGroupBundle) => void) {
    this._accountant = accountant;
    this._onRelease = onRelease;
  }

  /** Monotonic resource generation (see {@link RetainedGroupBundle}). */
  public get generation(): number {
    return this._generation;
  }

  public get instanceBuffer(): GPUBuffer | null {
    return this._instanceBuffer;
  }

  public get transformBuffer(): GPUBuffer | null {
    return this._transformBuffer;
  }

  /**
   * The shared frame-buffer row the stored transform rows were rebased from
   * (Slice 4c, {@link RetainedGroupBundle.transformRowBase}). A group-local row
   * is `capturedNodeIndex - transformRowBase`; the reconciler maps a moved
   * node's captured index back to the group-owned storage without re-recording.
   */
  public get transformRowBase(): number {
    return this._transformRowBase;
  }

  public get uniformBuffer(): GPUBuffer | null {
    return this._uniformBuffer;
  }

  /** Whether all GPU resources exist (false before the first finalized capture / after device loss). */
  public get isReady(): boolean {
    return this._instanceBuffer !== null && this._transformBuffer !== null && this._uniformBuffer !== null;
  }

  /**
   * Ensure the grow-only buffers cover `instanceBytes` + `transformBytes`.
   * Recreating any buffer bumps {@link generation} (draws recorded against
   * the old buffer must never replay) and drops the cached bind group.
   */
  public ensureCapacity(device: GPUDevice, instanceBytes: number, transformBytes: number): void {
    let recreated = false;

    if (this._instanceBuffer === null || this._instanceCapacity < instanceBytes) {
      const capacity = growCapacity(this._instanceCapacity, instanceBytes);

      this._instanceBuffer?.destroy();
      this._instanceBuffer = device.createBuffer({
        label: 'sprite:retained-instance-buffer',
        size: capacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this._instanceCapacity = capacity;
      recreated = true;
    }

    if (this._transformBuffer === null || this._transformCapacity < transformBytes) {
      const capacity = growCapacity(this._transformCapacity, transformBytes);

      this._transformBuffer?.destroy();
      this._transformBuffer = device.createBuffer({
        label: 'sprite:retained-transform-buffer',
        size: capacity,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this._transformCapacity = capacity;
      recreated = true;
    }

    if (this._uniformBuffer === null) {
      this._uniformBuffer = device.createBuffer({
        label: 'sprite:retained-uniform-buffer',
        size: retainedGroupUniformBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uboWritten = false;
      recreated = true;
    }

    if (recreated) {
      this._generation++;
      this._bindGroup = null;
      this._accountedBytes = this._accountant.reallocate(this._accountedBytes, this._instanceCapacity + this._transformCapacity + retainedGroupUniformBytes);
    }
  }

  /**
   * Record the group-local transform range this capture just uploaded (Slice
   * 4c): the shared-buffer rebase `base`, the `rowCount` now living in the
   * storage buffer, and the `device` whose queue a later in-place patch writes
   * through. Called by the backend right after it copies the rows into the
   * group-owned storage buffer.
   */
  public _recordTransformRowRange(device: GPUDevice, base: number, rowCount: number): void {
    this._patchDevice = device;
    this._transformRowBase = base;
    this._transformRowCount = rowCount;
  }

  /**
   * Slice 4c fast patch: overwrite one group-local transform row in place with
   * `floats` (12 = one `TransformSlot`, the {@link TransformBuffer} row layout)
   * via a single `queue.writeBuffer` of that row's 48-byte sub-range. Mirrors
   * {@link WebGl2RetainedGroupResources._patchTransformRow}: deliberately does
   * NOT bump the generation — the recorded instance bytes reference this row by
   * index and stay valid; only the transform behind the index moved.
   *
   * Out-of-range rows are ignored (a stale queue entry after a recapture shrank
   * the store), as is any patch before a range is recorded or after device loss
   * (`_transformBuffer`/`_patchDevice` null).
   */
  public _patchTransformRow(localRow: number, floats: Float32Array): void {
    if (this._transformBuffer === null || this._patchDevice === null || localRow < 0 || localRow >= this._transformRowCount) {
      return;
    }

    this._patchDevice.queue.writeBuffer(
      this._transformBuffer,
      localRow * retainedTransformSlotBytes,
      floats.buffer,
      floats.byteOffset,
      retainedTransformSlotBytes,
    );
  }

  /**
   * The bind group(0) pairing the group UBO with the group transform storage,
   * against the sprite renderer's existing uniform layout. Cached; rebuilt
   * when a buffer or the layout (device restore) changed identity.
   */
  public getBindGroup(device: GPUDevice, layout: GPUBindGroupLayout): GPUBindGroup {
    if (this._bindGroup !== null && this._bindGroupLayout === layout) {
      return this._bindGroup;
    }

    this._bindGroupLayout = layout;
    this._bindGroup = device.createBindGroup({
      label: 'sprite:retained-bind-group',
      layout,
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer! } },
        { binding: 1, resource: { buffer: this._transformBuffer! } },
      ],
    });

    return this._bindGroup;
  }

  /**
   * Drop all GPU state. With `destroyBuffers` the buffers are explicitly
   * destroyed (live device); without, they belonged to a lost device and are
   * simply released. Either way the generation bumps, so every instruction
   * set recorded against the old resources fails validation and re-records.
   */
  public invalidateDeviceState(destroyBuffers: boolean): void {
    if (destroyBuffers) {
      this._instanceBuffer?.destroy();
      this._transformBuffer?.destroy();
      this._uniformBuffer?.destroy();
    }

    this._instanceBuffer = null;
    this._transformBuffer = null;
    this._uniformBuffer = null;
    this._instanceCapacity = 0;
    this._transformCapacity = 0;
    this._transformRowCount = 0;
    this._patchDevice = null;
    this._bindGroup = null;
    this._bindGroupLayout = null;
    this._generation++;
    this.uboWritten = false;
    this.uboView = null;
    this.uboViewUpdateId = -1;
    this.drawsInPass = null;

    if (this._accountedBytes > 0) {
      this._accountant.free(this._accountedBytes);
      this._accountedBytes = 0;
    }
  }

  /** Release the bundle (container destroy / disengage / backend switch). */
  public destroy(): void {
    this.invalidateDeviceState(true);
    this._onRelease?.(this);
    this._onRelease = null;
  }
}

/** Power-of-two growth from `current` to at least `min` (min 256 B). */
const growCapacity = (current: number, min: number): number => {
  let next = Math.max(current, 256);

  while (next < min) {
    next *= 2;
  }

  return next;
};
