/**
 * Per-frame hardware GPU clock owned by a backend.
 *
 * A backend creates one only when the device exposes a real GPU timer
 * (`EXT_disjoint_timer_query_webgl2` on WebGL2, the `timestamp-query` feature on
 * WebGPU); there is no software fallback, because the wall-clock stand-ins for a
 * GPU frame time are floored by completion-observation latency rather than by
 * GPU work and would report milliseconds for microseconds of rendering.
 *
 * Results arrive asynchronously, so {@link lastFrameMs} always trails the frame
 * being drawn - it is the newest frame whose results have come back, not the
 * one currently on screen.
 * @internal
 */
export interface GpuTimer {
  /**
   * GPU time of the most recent frame whose timer results resolved, in
   * milliseconds, or `null` while none has - before the first result arrives,
   * and after the timer stopped producing usable results.
   */
  readonly lastFrameMs: number | null;

  /** Open the timed window for the frame that is about to be recorded. */
  beginFrame(): void;

  /** Close the timed window. Called after the frame's GPU work has been submitted. */
  endFrame(): void;

  /** Release the timer's GPU objects. */
  destroy(): void;
}
