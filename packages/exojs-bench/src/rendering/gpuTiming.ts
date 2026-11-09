/** Query scope, independent of whether the browser uses a physical or software adapter. */
export type GpuTimingSource = 'webgl2-time-elapsed' | 'webgpu-render-pass-timestamps' | 'none';

/** Accounting for every frame offered to a GPU-query timer. */
export interface GpuTimingDiagnostics {
  readonly source: GpuTimingSource;
  readonly status: 'complete' | 'partial' | 'unavailable' | 'failed';
  readonly attemptedFrames: number;
  readonly validFrames: number;
  readonly invalidFrames: number;
  readonly unresolvedFrames: number;
  readonly skippedFrames: number;
}

/** Serializable observations shared by browser acquisition and Node reporting. */
export interface GpuFrameSamples {
  /** Per-frame GPU query-clock intervals (ms). Empty when unavailable. */
  readonly frameMs: readonly number[];
  /** WebGPU only: CPU-observed queue-completion intervals (ms), not GPU execution time. */
  readonly queueMs: readonly number[];
  /** Timed-window frame indices corresponding to {@link frameMs}. */
  readonly frameIndices?: readonly number[];
  /** Timed-window frame indices corresponding to {@link queueMs}. */
  readonly queueFrameIndices?: readonly number[];
  /** GPU-query coverage; absent only from older/custom timer implementations. */
  readonly timing?: GpuTimingDiagnostics;
}
