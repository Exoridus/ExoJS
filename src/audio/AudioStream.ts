import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';

import { getAudioContext } from './audio-context';
import type { AudioManager } from './AudioManager';
import { AudioStreamVoice } from './AudioStreamVoice';
import type { Playable, PlayOptions, Voice } from './Playable';
import { seedVoiceFromPlayOptions } from './spatial-options';

/**
 * Streaming long-form audio backed by an `HTMLAudioElement` — background
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
 * voice at a time** — playing again stops the previous voice. Routes through the
 * manager's `music` bus by default (override via {@link PlayOptions.bus}).
 *
 * Use {@link Sound} for short, frequently-triggered clips that benefit from
 * pre-decoded `AudioBuffer` storage and pooled overlapping playback.
 */
export class AudioStream implements Playable {
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

  public constructor(audioElement: HTMLAudioElement, options?: Partial<PlaybackOptions>) {
    this._audioElement = audioElement;
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
   * Implements {@link Playable}. Called by {@link AudioManager.play}.
   *
   * Stops any previously active voice (a stream has a single playhead), then
   * starts a fresh {@link AudioStreamVoice}.
   */
  public _createVoice(manager: AudioManager, options: PlayOptions): Voice {
    const bus = options.bus ?? manager.music;
    const audioContext = getAudioContext();

    if (this._activeVoice !== null && !this._activeVoice.ended) {
      this._activeVoice.stop();
    }

    // The MediaElementAudioSourceNode is 1:1 with the element — create it once.
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

    this._activeVoice = voice;
    voice.onEnd.add((): void => {
      if (this._activeVoice === voice) this._activeVoice = null;
    });

    return voice;
  }

  /** Stop the active voice and release the media graph. */
  public destroy(): void {
    if (this._activeVoice !== null) {
      this._activeVoice.stop();
      this._activeVoice = null;
    }
    if (this._sourceNode !== null) {
      this._sourceNode.disconnect();
      this._sourceNode = null;
    }
  }
}
