/**
 * Per-frame rendering counters collected by the backend each tick.
 * Expose live performance data for debugging and profiling tools.
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
});

/**
 * Advance the frame counter and zero all per-frame accumulators in place.
 * Call once at the start of each render tick before recording new data.
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

  return stats;
};
