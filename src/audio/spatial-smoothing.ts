/**
 * Shared position-smoothing layer for spatial audio. Both the
 * {@link AudioListener} and every spatial {@link BaseVoice} write their
 * per-frame `positionX/Y/Z` (and, in future, orientation) `AudioParam`s through
 * this layer instead of calling `setValueAtTime` directly every frame.
 *
 * Writing a raw stepwise value each frame produces audible zipper noise on fast
 * movement (expert-review finding AU4). Instead each param is:
 * - **skipped** when the new value is within {@link POSITION_EPSILON} of the last
 *   written value (a stationary emitter costs zero param scheduling after its
 *   first frame), and
 * - **snapped** with `setValueAtTime` on the first write and on a teleport (a
 *   jump larger than {@link SpatialSmoothingSettings.teleportThreshold}), so a
 *   warp does not audibly glide across the stereo field, or
 * - **ramped** with `setTargetAtTime` toward the target using the configured
 *   time constant, which is robust to a variable frame rate and converges within
 *   ~3τ.
 *
 * This is the tactical smoothing layer for today's panner/listener surface; the
 * forthcoming 3D-spatializer design (`S2-audio-spatializer`) extends the same
 * settings object with distance/panning defaults.
 */

/** Time constant (seconds) for `setTargetAtTime`. 20 ms — see module docs. */
export const DEFAULT_SPATIAL_SMOOTHING = 0.02;

/** Position jump (world units) treated as a teleport → snap instead of ramp. */
export const DEFAULT_TELEPORT_THRESHOLD = 400;

/**
 * Position deltas below this (world units) are treated as stationary and skipped
 * entirely, so a static emitter/listener stops scheduling params after its first
 * frame.
 */
export const POSITION_EPSILON = 0.01;

/**
 * Tunable smoothing settings shared by the listener and all spatial voices. Owned
 * by {@link AudioManager} and reachable as `app.audio.spatial`.
 */
export interface SpatialSmoothingSettings {
  /**
   * Time constant (seconds) passed to `setTargetAtTime` when ramping a moving
   * position toward its target. `0` (or negative) disables ramping — positions
   * snap each frame. Default {@link DEFAULT_SPATIAL_SMOOTHING} (20 ms).
   */
  smoothing: number;
  /**
   * Position jump (world units) treated as a teleport: the param snaps with
   * `setValueAtTime` instead of ramping. Default
   * {@link DEFAULT_TELEPORT_THRESHOLD}.
   */
  teleportThreshold: number;
}

/** Construct the default spatial smoothing settings. */
export const createSpatialSmoothingSettings = (): SpatialSmoothingSettings => ({
  smoothing: DEFAULT_SPATIAL_SMOOTHING,
  teleportThreshold: DEFAULT_TELEPORT_THRESHOLD,
});

/**
 * Tracks the last value written to a single `AudioParam` so per-frame updates can
 * be epsilon-skipped, snapped, or ramped (see module docs). One instance per
 * scalar param (x / y / z). Allocation-free on the hot path.
 */
export class SmoothedAudioParam {
  private _last = 0;
  private _hasWritten = false;

  /**
   * Write `value` to `param` at time `now`, applying epsilon-skip / teleport-snap
   * / ramp according to `settings`.
   */
  public write(param: AudioParam, value: number, now: number, settings: SpatialSmoothingSettings): void {
    if (this._hasWritten && Math.abs(value - this._last) < POSITION_EPSILON) {
      return;
    }

    if (!this._hasWritten || settings.smoothing <= 0 || Math.abs(value - this._last) > settings.teleportThreshold) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    } else {
      param.setTargetAtTime(value, now, settings.smoothing);
    }

    this._last = value;
    this._hasWritten = true;
  }

  /** Forget the last written value so the next write snaps (used on teardown / reuse). */
  public reset(): void {
    this._hasWritten = false;
    this._last = 0;
  }
}
