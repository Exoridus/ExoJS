import type { MeshIndexFormat } from '#rendering/mesh/indices';
import type { RetainedBatchInstruction } from '#rendering/plan/RetainedInstructionSet';
import type { Renderer } from '#rendering/Renderer';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { BlendModes } from '#rendering/types';

import type { WebGpuRetainedGroupBundle } from './WebGpuRetainedGroupBundle';

/** Bytes of one transform slot (2 × vec4<f32>, matches the WGSL `TransformSlot`). */
export const retainedTransformSlotBytes = 32;

/** Bytes of one packed rgba8 tint slot (one `u32`, matches the WGSL `tints` storage array). */
export const retainedTintSlotBytes = 4;

/**
 * Reference to the renderer-owned, persistent, SHARED geometry an indexed
 * retained batch draws (mesh opt-in). The vertex + index buffers live in the
 * recording renderer's own long-lived cache (the mesh renderer's
 * `_staticGeometryCache`, one buffer pair per `Geometry`, shared across
 * frames/groups); the group bundle stores only the thin per-instance
 * node-index stream, never the geometry bytes.
 */
export interface WebGpuRetainedGeometryRef {
  readonly vertexBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  /** Width `indexBuffer` holds, so replay binds it with the format it was packed at. */
  readonly indexFormat: MeshIndexFormat;
}

/**
 * Auxiliary, renderer-owned GPU state a replayer may attach to a bundle
 * (option (a) of the mesh generalization). Sprite/nine-slice/repeating leave
 * it null and drive replay entirely from the bundle's own sprite-layout UBO;
 * the mesh renderer parks its group(0) `TransformUniforms` UBO + bind group
 * here so the bundle can dispose it on device loss / destroy - giving the
 * mesh UBO the same grow-only, explicitly-freed lifecycle as the bundle's own
 * buffers WITHOUT the bundle needing to know the mesh layout.
 */
export interface WebGpuRetainedRendererReplayState {
  /** Release any GPU buffers this state owns (called from the bundle). */
  destroy(): void;
}

/** Bytes of the per-group uniform buffer (projection mat4 + group mat4 + snap viewport vec4). */
export const retainedGroupUniformBytes = 144;

/**
 * Backend-owned replay descriptor for one recorded renderer flush. Carried
 * as the opaque `payload` of a
 * {@link RetainedBatchInstruction}; everything here is DATA - all state
 * (pipeline, projection/group uniforms, texture bindings) is resolved live at
 * replay by the owning {@link WebGpuRetainedBatchReplayer.replayRetainedBatch}.
 */
export interface WebGpuRetainedBatchPayload {
  /** The renderer that recorded (and replays) this batch. */
  readonly renderer: WebGpuRetainedBatchReplayer;
  /** The bundle whose group-owned buffers hold this batch's data. */
  readonly bundle: WebGpuRetainedGroupBundle;
  /** Byte offset of this batch's instances inside the bundle's instance buffer. */
  readonly byteOffset: number;
  readonly instanceCount: number;
  readonly blendMode: BlendModes;
  /**
   * Shared, persistent geometry for an INDEXED batch (mesh opt-in): the
   * renderer-owned vertex + index buffers this batch's node-index stream
   * instances. `null`/absent for the self-contained instance-stream renderers
   * (sprite / nine-slice / repeating), which bind the renderer's own quad
   * index buffer and one vertex buffer.
   */
  readonly geometry?: WebGpuRetainedGeometryRef | null;
  /**
   * This batch's index within its OWNING bundle's recording (generic per-batch
   * ordinal; `owner.staged.length` at record time). Indexed renderers use it as
   * the group-owned uniform slot for their per-batch dynamic-offset UBO write;
   * the self-contained instance-stream renderers ignore it.
   */
  readonly batchIndexInBundle?: number;
  /** Slot-ordered batch textures; bind group(1) is re-resolved live from these. */
  readonly textures: ReadonlyArray<Texture | RenderTexture>;
  /**
   * The managed texture views at record time, parallel to {@link textures}.
   * Collect-time validation compares them against the live managed
   * views: `_syncTexture` recreates the view on RESIZE, and resized textures
   * invalidate the recorded UV words - so a view-identity mismatch must force
   * a recapture, never a replay.
   */
  readonly recordedViews: readonly GPUTextureView[];
  /**
   * `Texture.flipY` at record time, parallel to {@link textures}. The recorded
   * UV words carry the vertical swap already applied, so a texture that flips
   * afterwards must force a recapture even though its view and size are
   * unchanged.
   */
  readonly recordedFlipY: readonly boolean[];
  /**
   * Opaque, renderer-private data captured alongside this batch (Text opt-in):
   * for a renderer whose per-instance node index addresses its OWN private
   * data store rather than the shared transform buffer (`_consumesSharedTransform
   * === false`), the generic bundle/scan/rebase machinery has nothing to persist
   * on its behalf - this field is the renderer's own escape hatch to carry
   * whatever CPU-side snapshot it needs from record time through to replay,
   * where only the renderer that set it interprets the value.
   */
  readonly rendererData?: unknown;
}

/**
 * Mutable node-index range scratch used at record time, the WebGPU
 * counterpart of `WebGl2RetainedNodeIndexRange`. Unlike WebGL2 (which scans
 * the shared bundle store at capture END, once ranges over every batch are
 * known), WebGPU scans each batch's freshly-packed bytes immediately at
 * record time, per batch - so the range here is scoped to ONE batch, not the
 * whole capture; the backend takes the min/max across all per-batch ranges to
 * get the capture-wide rebase base.
 */
export interface WebGpuRetainedNodeIndexRange {
  min: number;
  max: number;
}

/**
 * Renderer-side contract for recorded-batch finalization and replay on WebGPU
 * (the WebGPU counterpart of `WebGl2RetainedBatchReplayer`). The bundle/stage
 * stores raw instance bytes; only the renderer that packed them knows the
 * layout (where the node index lives, how many words per instance), so the
 * backend delegates the layout-aware steps here per batch - mirroring the
 * WebGL2 seam, adapted to WebGPU's byte-staging flow (record-time scan on
 * freshly-packed bytes, finalize-time rebase on the staged copy, rather than
 * WebGL2's capture-end scan/rebase against a live bundle store).
 *
 * Extends {@link Renderer} so the backend can drive replay through the same
 * active-renderer bookkeeping (`_setActiveRenderer` calls `flush()` on
 * renderer switch) it already uses for live playback.
 */
export interface WebGpuRetainedBatchReplayer extends Renderer {
  /** Widen `range` to cover every shared-transform row `bytes` (one batch's packed instances) references. */
  scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void;
  /** Rewrite `bytes`' instance node indices in place to group-local (`index - base`). */
  rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void;
  /** Preflight structural live state before any instruction in the set draws. */
  validateRetainedBatch?(payload: WebGpuRetainedBatchPayload): boolean;
  /** Replay the batch: live state (pipeline, uniforms, textures), cached data (bytes, transforms). */
  replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void;
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
   * grow-only buffers are finalized - growth bumps the generation, so
   * stamping earlier would self-invalidate the set.
   */
  readonly instruction: RetainedBatchInstruction;
}
