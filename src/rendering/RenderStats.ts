/**
 * Per-frame rendering counters collected by the backend each tick.
 * Expose live performance data for debugging and profiling tools.
 * @advanced
 */
export interface RenderStats {
  /** Monotonically increasing frame index, incremented by {@link resetRenderStats}. */
  frame: number;
  /** Total scene nodes submitted for rendering before culling. */
  submittedNodes: number;
  /** Nodes skipped because they fell outside the view frustum. */
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
   * accumulator: it is **not** zeroed by {@link resetRenderStats} — live
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
 * read 0 after the first frame.
 */
export const resetRenderStats = (stats: RenderStats): RenderStats => {
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
