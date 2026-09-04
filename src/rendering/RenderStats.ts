import { nodeDirtyIndex } from '#core/nodeDirtyIndex';

/**
 * Per-frame rendering counters collected by the backend each tick.
 * Expose live performance data for debugging and profiling tools.
 * @advanced
 */
export interface RenderStats {
  /** Monotonically increasing frame index, incremented by {@link resetRenderStats}. */
  frame: number;
  /**
   * Total scene nodes submitted for rendering before culling.
   *
   * Always nodes, never GPU instances: a node whose renderer expands it into
   * many instances - a tile chunk, a nine-slice, a repeating sprite, a text run -
   * counts once, and reads the same whether the frame was drawn live, replayed
   * entry by entry, or replayed from a recorded retained batch.
   */
  submittedNodes: number;
  /**
   * Nodes skipped because they fell outside the view frustum.
   *
   * Two caveats apply to retained subtrees, both by design:
   * - the count is per COLLECT, not per frame. A retained subtree that replays
   *   without re-collecting reports nothing here, so a scene whose first frame
   *   culls N nodes reports 0 on every steady-state frame that follows and
   *   reports N again only when a rebuild re-walks it. Read it as "nodes the
   *   last collect discarded", not as "nodes off-screen this frame".
   * - the decision is taken against the cull rectangle retention inflates by
   *   1/16 per side, not the exact view rectangle. A node just outside the view
   *   is therefore kept rather than culled - that margin is what lets a small
   *   camera move replay instead of re-collect.
   */
  culledNodes: number;
  /** Number of GPU draw calls issued this frame. */
  drawCalls: number;
  /** Number of draw batches flushed this frame. */
  batches: number;
  /** Number of render passes executed this frame. */
  renderPasses: number;
  /** Number of render-target switches this frame. */
  renderTargetChanges: number;
  /** Wall-clock duration of the frame in milliseconds. */
  frameTimeMs: number;
  /**
   * GPU-side duration in milliseconds of the last frame whose hardware timer
   * results have come back, or `null` when no such result exists yet.
   *
   * Reads `null` unless {@link RenderBackend.setGpuTimingEnabled} has been
   * called and reported a hardware clock; there is no software substitute, so a
   * device without one leaves this `null` for the whole session.
   *
   * GPU results resolve asynchronously, so this is **not** the frame the other
   * counters describe - it trails them by at least one frame. It is likewise
   * **not** zeroed by {@link resetRenderStats}, since the frame it belongs to
   * has already ended by the time the value arrives.
   *
   * What the number covers differs by backend, and the two are not directly
   * comparable: WebGL2 brackets the frame's whole GL command stream (uploads
   * included), while WebGPU sums the execution of the frame's render passes and
   * therefore excludes queue-side uploads.
   */
  gpuFrameTimeMs: number | null;
  /**
   * Raw wall-clock delta between this frame and the previous one, in
   * milliseconds. May exceed the clamped simulation delta when the engine's
   * internal `MAX_DELTA_MS` guard activates (e.g. after a debugger pause or
   * device sleep/resume). Use this for profiling to distinguish actual elapsed
   * time from the clamped simulation delta passed to update recipients.
   */
  rawFrameDeltaMs: number;
  /**
   * Estimated bytes of live GPU memory: the sum over all resident textures
   * (`width · height · bytesPerPixel`, including mip chains) plus all resident
   * GPU buffers (`byteLength`). The GPU exposes no VRAM query, so the engine
   * books every allocation and free itself; this is an upper-bound estimate of
   * the engine-owned footprint, not a driver figure.
   *
   * Unlike the other counters this is a **running total**, not a per-frame
   * accumulator: it is **not** zeroed by {@link resetRenderStats} - live
   * resources outlive frames. It rises when textures/buffers are created and
   * falls when they are destroyed.
   */
  gpuMemoryBytes: number;
  /**
   * Bytes of content-texture pixel data uploaded CPU → GPU this frame
   * (`texSubImage2D` / `texImage2D` pixel uploads on WebGL2; `writeTexture` on
   * WebGPU). Per-frame accumulator; a static frame that re-uploads nothing
   * reports 0.
   */
  textureUploadBytes: number;
  /**
   * Bytes of buffer data uploaded CPU → GPU this frame (vertex / index /
   * transform-storage writes). Per-frame accumulator.
   */
  bufferUploadBytes: number;
  /**
   * Bytes read back GPU → CPU this frame (e.g. `mapAsync` of a storage buffer,
   * render-texture readback). Practically 0 in the 2D render path today; the
   * counter exists so readback paths (screenshots, GPU picking, particle
   * compute) are accounted for when present. Per-frame accumulator.
   */
  downloadBytes: number;
  /** Number of GPU → CPU readback operations issued this frame. Per-frame accumulator. */
  downloadCount: number;
}

/**
 * Allocate a zeroed {@link RenderStats} object for the first frame.
 */
export const createRenderStats = (): RenderStats => ({
  frame: 0,
  submittedNodes: 0,
  culledNodes: 0,
  drawCalls: 0,
  batches: 0,
  renderPasses: 0,
  renderTargetChanges: 0,
  frameTimeMs: 0,
  gpuFrameTimeMs: null,
  rawFrameDeltaMs: 0,
  gpuMemoryBytes: 0,
  textureUploadBytes: 0,
  bufferUploadBytes: 0,
  downloadBytes: 0,
  downloadCount: 0,
});

/**
 * Advance the frame counter and zero all per-frame accumulators in place.
 * Call once at the start of each render tick before recording new data.
 *
 * Note: {@link RenderStats.gpuMemoryBytes} is intentionally **not** reset here.
 * It is a running total of live GPU resources owned by the backend's resource
 * accountant, which persists across frames; zeroing it each tick would make it
 * read 0 after the first frame. {@link RenderStats.gpuFrameTimeMs} is likewise
 * left alone: it describes an already-finished frame whose results resolved
 * late, so zeroing it per tick would blank it on every frame it is read on.
 */
export const resetRenderStats = (stats: RenderStats): RenderStats => {
  // The dirty index counts in frames, and this is where a frame begins. Opening
  // a generation per render instead would rotate the window several times in a
  // frame that draws more than one root and push every consumer out of it.
  nodeDirtyIndex.advance();

  stats.frame++;
  stats.submittedNodes = 0;
  stats.culledNodes = 0;
  stats.drawCalls = 0;
  stats.batches = 0;
  stats.renderPasses = 0;
  stats.renderTargetChanges = 0;
  stats.frameTimeMs = 0;
  stats.rawFrameDeltaMs = 0;
  stats.textureUploadBytes = 0;
  stats.bufferUploadBytes = 0;
  stats.downloadBytes = 0;
  stats.downloadCount = 0;

  return stats;
};
