import { mediaErrorMessage } from '#core/mediaError';
import { Signal } from '#core/Signal';
import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';

import { getAudioContext } from './audio-context';
import type { AudioManager } from './AudioManager';
import { AudioStreamVoice } from './AudioStreamVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { seedVoiceFromPlayOptions, seedVoiceSends } from './spatial-options';

/**
 * Streaming long-form audio backed by an `HTMLAudioElement` - background
 * tracks, voice-over, **and internet radio** (same mechanism, low CPU/RAM).
 * Decoded lazily via the browser's media pipeline, so memory cost scales with
 * the decode buffer rather than total duration.
 *
 * `AudioStream` is a **data descriptor**: it holds the media element and default
 * playback parameters but does not play itself. Playback is driven by
 * `AudioManager.play(stream, options)`, which returns an {@link AudioStreamVoice}
 * for fine-grained control (pause/resume, seek, loop, rate, volume, spatial).
 *
 * Because an `HTMLAudioElement` has a single playhead, a stream has **one active
 * voice at a time** - playing again stops the previous voice. Routes through the
 * manager's `music` bus by default (override via {@link PlayOptions.bus}).
 *
 * Use {@link Sound} for short, frequently-triggered clips that benefit from
 * pre-decoded `AudioBuffer` storage and pooled overlapping playback.
 */
export class AudioStream implements Playable {
  /**
   * Dispatched when the media fails after the asset was already usable - a
   * transfer that breaks mid-playback, or a decode error further into the file.
   *
   * A failure BEFORE the asset becomes ready fails the load instead, and is
   * reported by `Loader.onError`; this signal is the runtime counterpart, so
   * one load never appears to fail twice.
   */
  public readonly onError = new Signal<[error: Error]>();

  private readonly _audioElement: HTMLMediaElement;

  /** Default volume applied to new voices. Range [0, 1]. */
  public volume: number;
  /** Default loop flag applied to new voices. */
  public loop: boolean;
  /** Default playback rate applied to new voices. */
  public playbackRate: number;
  /** Default muted flag (starts a voice at volume 0). */
  public muted: boolean;

  private _sourceNode: MediaElementAudioSourceNode | null = null;
  private _activeVoice: AudioStreamVoice | null = null;
  private _destroyed = false;
  private readonly _onErrorHandler = (): void => {
    this.onError.dispatch(new Error(mediaErrorMessage(this._audioElement, 'Audio playback failed.')));
  };

  public constructor(audioElement: HTMLAudioElement, options?: Partial<PlaybackOptions>) {
    this._audioElement = audioElement;
    this._audioElement.addEventListener('error', this._onErrorHandler);
    this.volume = clamp(options?.volume ?? 1, 0, 1);
    this.loop = options?.loop ?? false;
    this.playbackRate = clamp(options?.playbackRate ?? 1, 0.1, 20);
    this.muted = options?.muted ?? false;

    if (options?.time !== undefined) {
      this._audioElement.currentTime = Math.max(0, options.time);
    }
  }

  /** The backing `HTMLAudioElement`. */
  public get audioElement(): HTMLMediaElement {
    return this._audioElement;
  }

  /** Total media duration in seconds (`NaN` until metadata has loaded). */
  public get duration(): number {
    return this._audioElement.duration;
  }

  /**
   * `true` once {@link AudioStream.destroy} has run. A destroyed stream is not
   * reusable - playing it throws. Load the asset again to get a fresh stream.
   */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Implements {@link Playable}. Called by {@link AudioManager.play}.
   *
   * Stops any previously active voice (a stream has a single playhead), then
   * starts a fresh {@link AudioStreamVoice}.
   *
   * Throws on a destroyed stream. The check is unconditional, not `__DEV__`-only:
   * `createMediaElementSource()` may be called exactly once per media element,
   * and the second call raises `InvalidStateError` in the browser - a hard,
   * hard-to-trace runtime failure that a production build must not walk into.
   */
  public _createVoice(manager: AudioManager, options: PlayOptions): Voice {
    if (this._destroyed) {
      throw new Error(
        'Cannot play a destroyed AudioStream. `destroy()` releases the MediaElementAudioSourceNode that is ' +
          'permanently bound to the backing media element, and the Web Audio API allows only one such node per ' +
          'element — re-sourcing it would throw InvalidStateError. Load the asset again to obtain a fresh stream.',
      );
    }

    const bus = options.bus ?? manager.music;
    const audioContext = getAudioContext();

    if (this._activeVoice !== null && !this._activeVoice.ended) {
      this._activeVoice.stop();
    }

    // The MediaElementAudioSourceNode is 1:1 with the element - create it once.
    if (this._sourceNode === null) {
      this._sourceNode = audioContext.createMediaElementSource(this._audioElement);
    } else {
      this._sourceNode.disconnect();
    }

    const output = audioContext.createGain();
    const loop = options.loop ?? this.loop;
    const playbackRate = clamp(options.playbackRate ?? this.playbackRate, 0.1, 20);
    const volume = clamp(options.muted ? 0 : (options.volume ?? (this.muted ? 0 : this.volume)), 0, 1);

    const voice = new AudioStreamVoice({
      audioContext,
      output,
      bus,
      manager,
      volume,
      element: this._audioElement,
      sourceNode: this._sourceNode,
      loop,
      playbackRate,
      ...(options.time !== undefined && { startTime: options.time }),
    });

    seedVoiceFromPlayOptions(voice, options);
    seedVoiceSends(voice, options);

    this._activeVoice = voice;
    voice.onEnd.add((): void => {
      if (this._activeVoice === voice) this._activeVoice = null;
    });

    return voice;
  }

  /**
   * Stop the active voice and release the media graph. Terminal: the stream
   * cannot be played again afterwards (see {@link AudioStream.destroyed}).
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._audioElement.removeEventListener('error', this._onErrorHandler);
    if (this._activeVoice !== null) {
      this._activeVoice.stop();
      this._activeVoice = null;
    }
    if (this._sourceNode !== null) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
    this.onError.destroy();
  }
}
