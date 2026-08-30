/**
 * Shared position-smoothing layer for spatial audio. Every spatial
 * {@link BaseVoice} writes its per-frame `positionX/Y/Z` and orientation
 * `AudioParam`s through this layer instead of calling `setValueAtTime` directly
 * every frame.
 *
 * The {@link AudioListener} does not: it is virtual, and the real WebAudio
 * listener stays pinned at the origin, so listener motion reaches the mix as
 * part of each voice's relative position and is smoothed there - see
 * {@link SpatialSmoothingSettings.teleportThreshold} for the one place that
 * distinction is observable.
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
 * The same settings object carries the app-wide spatial defaults - panning model,
 * Doppler scale, and the two occlusion endpoints - because they are tuned
 * together and read on the same per-frame path.
 */

/** Time constant (seconds) for `setTargetAtTime`. 20 ms - see module docs. */
export const DEFAULT_SPATIAL_SMOOTHING = 0.02;

/** Position jump (world units) treated as a teleport → snap instead of ramp. */
export const DEFAULT_TELEPORT_THRESHOLD = 400;

/**
 * Position deltas below this (world units) are treated as stationary and skipped
 * entirely, so a static emitter/listener stops scheduling params after its first
 * frame.
 */
export const POSITION_EPSILON = 0.01;

/** Lowpass cutoff (Hz) a fully occluded voice is filtered to. */
export const DEFAULT_OCCLUSION_CUTOFF = 400;

/** Linear gain a fully occluded voice is attenuated to. */
export const DEFAULT_OCCLUSION_ATTENUATION = 0.25;

/**
 * Tunable smoothing settings shared by the listener and all spatial voices. Owned
 * by {@link AudioSystem} and reachable as `app.audio.spatial`.
 */
export interface SpatialSmoothingSettings {
  /**
   * Time constant (seconds) passed to `setTargetAtTime` when ramping a moving
   * position toward its target. `0` (or negative) disables ramping - positions
   * snap each frame. Default {@link DEFAULT_SPATIAL_SMOOTHING} (20 ms).
   */
  smoothing: number;
  /**
   * Position jump (world units) treated as a teleport: the param snaps with
   * `setValueAtTime` instead of ramping. Default
   * {@link DEFAULT_TELEPORT_THRESHOLD}.
   *
   * Measured on the **source-to-listener offset**, not on either absolute
   * position - voices are panned relative to their own application's
   * {@link AudioListener}, which is virtual. Practically: warping the listener
   * is a teleport for every spatial voice at once (each snaps its own panner),
   * and a source that warps *together with* the listener does not cross the
   * threshold at all, because its offset never changed.
   */
  teleportThreshold: number;
  /**
   * App-wide default panning model for every spatial voice that doesn't set
   * its own {@link Spatializable.panningModel} override. `'equalpower'`
   * (cheap, works on any speaker setup) or `'HRTF'` (binaural, meaningfully
   * more CPU-expensive per voice, only sounds convincingly directional
   * through headphones). Default `'equalpower'`.
   */
  panningModel: PanningModelType;
  /**
   * Doppler pitch-shift strength multiplier. `0` (default) disables Doppler
   * entirely - even when velocity data is available on a voice or the
   * listener, no `playbackRate` modulation is applied unless this is set
   * above zero. `1` is physically scaled (relative to {@link speedOfSound});
   * many games deliberately exaggerate beyond `1` for player feedback.
   */
  dopplerFactor: number;
  /**
   * Reference speed (world units per second) used to scale the Doppler
   * effect. World units have no fixed physical scale across different
   * games (pixels, meters, tiles), so this is a tunable, not a physical
   * constant - pick a value where your game's typical emitter/listener
   * speeds produce a noticeable but not extreme shift.
   */
  speedOfSound: number;
  /**
   * Lowpass cutoff (Hz) a voice at {@link Spatializable.occlusion} `1` is
   * filtered to. Default {@link DEFAULT_OCCLUSION_CUTOFF} (400 Hz) - roughly
   * "behind a closed door". Interpolation between clear and fully occluded is
   * logarithmic, matching how pitch is perceived.
   */
  occlusionCutoff: number;
  /**
   * Linear gain a voice at {@link Spatializable.occlusion} `1` is attenuated to.
   * Default {@link DEFAULT_OCCLUSION_ATTENUATION}. Not `0`: a fully occluded
   * source that goes silent reads as a bug rather than as an obstruction.
   */
  occlusionAttenuation: number;
}

/** Construct the default spatial smoothing settings. */
export const createSpatialSmoothingSettings = (): SpatialSmoothingSettings => ({
  smoothing: DEFAULT_SPATIAL_SMOOTHING,
  teleportThreshold: DEFAULT_TELEPORT_THRESHOLD,
  panningModel: 'equalpower',
  dopplerFactor: 0,
  speedOfSound: 1000,
  occlusionCutoff: DEFAULT_OCCLUSION_CUTOFF,
  occlusionAttenuation: DEFAULT_OCCLUSION_ATTENUATION,
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
    // Reject NaN/±Infinity outright - never scheduled on the live AudioParam
    // (a real browser throws on `setTargetAtTime(NaN, ...)`) and never recorded
    // as `_last`, so an invalid tick can't poison every subsequent write.
    if (!Number.isFinite(value)) return;

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

/**
 * Floor applied to the elapsed time between two velocity samples (seconds).
 * Guards {@link deriveVelocity} against a divide-by-zero (or a near-infinite
 * velocity spike) when two samples land on the same `AudioContext.currentTime`
 * - which is not just a test artifact: an explicit `voice.position = ...`
 * write immediately followed by `AudioSystem.update()`'s per-frame tick can
 * genuinely both land inside the same audio-render quantum, before
 * `currentTime` has advanced at all.
 */
const MIN_VELOCITY_DT = 1e-3;

/**
 * Rolling velocity-sample state for one tracked point (a {@link BaseVoice}'s
 * position, or the {@link AudioListener}'s). Owned and mutated in place by
 * {@link deriveVelocity} - `x`/`y` are the last derived velocity components.
 */
export interface VelocitySample {
  lastPosition: { x: number; y: number } | null;
  lastTime: number;
  x: number;
  y: number;
}

/** Construct a fresh, never-sampled {@link VelocitySample}. */
export const createVelocitySample = (): VelocitySample => ({ lastPosition: null, lastTime: 0, x: 0, y: 0 });

/**
 * Auto-derive a 2D velocity from the position delta since the last sample,
 * updating `sample` in place. Shared by {@link BaseVoice} and
 * {@link AudioListener} so both sides of a Doppler calculation resolve
 * "auto-derived velocity" the same way.
 *
 * Below {@link POSITION_EPSILON} of movement, the sample is treated as
 * stationary and is skipped entirely - the previously derived velocity is
 * retained rather than snapped to zero, mirroring {@link SmoothedAudioParam}'s
 * own stationary-skip. This means a source that stops moving keeps its last
 * Doppler shift for one more tick instead of instantly zeroing it, and it
 * means a real movement is never lost to a same-timestamp sample (see
 * {@link MIN_VELOCITY_DT}) - the *next* distinctly-different position still
 * measures its delta against the last position that was actually recorded.
 */
export const deriveVelocity = (sample: VelocitySample, x: number, y: number, now: number): void => {
  if (sample.lastPosition === null) {
    sample.x = 0;
    sample.y = 0;
    sample.lastPosition = { x, y };
    sample.lastTime = now;
    return;
  }

  const dx = x - sample.lastPosition.x;
  const dy = y - sample.lastPosition.y;
  if (Math.hypot(dx, dy) < POSITION_EPSILON) {
    if (now > sample.lastTime) {
      sample.x = 0;
      sample.y = 0;
      // Mutate the existing point in place (never null on this branch -
      // the null-seed case returns above) instead of allocating a fresh
      // `{ x, y }` on what is the common per-frame path for every
      // stationary spatial voice.
      sample.lastPosition.x = x;
      sample.lastPosition.y = y;
      sample.lastTime = now;
    }
    return;
  }

  const dt = Math.max(now - sample.lastTime, MIN_VELOCITY_DT);
  sample.x = dx / dt;
  sample.y = dy / dt;
  sample.lastPosition = { x, y };
  sample.lastTime = now;
};
