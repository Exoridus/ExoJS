import type { AudioBus } from './AudioBus';
import type { AudioManager } from './AudioManager';

/**
 * Handle returned by {@link AudioManager.play}. Represents one active playback
 * instance. Multiple calls to `play()` for the same asset return independent
 * Voice handles, enabling concurrent overlapping playback.
 */
export interface Voice {
  /** Stop playback immediately and release resources. */
  stop(): void;
  /** Set the playback volume in the range [0, 2]. */
  setVolume(volume: number): void;
  /**
   * Fade to silence over `durationMs` milliseconds, then stop.
   * @param durationMs - Fade duration in milliseconds.
   */
  fadeOut(durationMs: number): void;
  /** `true` once playback has ended naturally or been stopped. */
  readonly ended: boolean;
}

/**
 * Per-play overrides passed to {@link AudioManager.play}.
 */
export interface PlayOptions {
  /** Route this play through a specific {@link AudioBus}. */
  bus?: AudioBus;
  /** Override volume for this play instance. Range [0, 2]. */
  volume?: number;
  /** Override looping for this play instance. */
  loop?: boolean;
  /** Override playback rate for this play instance. */
  playbackRate?: number;
  /** Seek offset in seconds before starting playback. */
  time?: number;
  /** Start muted. */
  muted?: boolean;
}

/**
 * Implemented by audio assets ({@link Sound}, {@link Music},
 * {@link OscillatorSound}) to support manager-driven playback via
 * {@link AudioManager.play}.
 *
 * Assets are **data descriptors** — they hold the audio data and default
 * playback parameters. The playback machinery lives in the {@link Voice}
 * returned by `_createVoice`. Assets do not call `getAudioManager()`
 * themselves; the manager is injected at play time.
 *
 * @internal - `_createVoice` is a low-level hook; consumers should call
 * `audioManager.play(asset)` instead of calling `_createVoice` directly.
 */
export interface Playable {
  /**
   * Create and start a new playback instance. Called by
   * {@link AudioManager.play}; do not call directly.
   *
   * @param manager - The owning {@link AudioManager} (provides bus hierarchy).
   * @param options - Per-play overrides.
   * @returns A {@link Voice} handle for the new instance.
   */
  _createVoice(manager: AudioManager, options: PlayOptions): Voice;
}
