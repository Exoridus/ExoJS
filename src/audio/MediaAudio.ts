import { mediaErrorMessage } from '#core/mediaError';
import { Signal } from '#core/Signal';
import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';

import { getAudioContext } from './audioContext';
import { AudioStreamVoice } from './AudioStreamVoice';
import type { AudioSystem } from './AudioSystem';
import type { Playable, PlayOptions, Voice, VoiceProfile } from './Playable';
import { seedVoiceFromPlayOptions, seedVoiceSends } from './spatialOptions';

/**
 * Audio played through the browser's media pipeline from an `HTMLAudioElement`,
 * shared by {@link Music} and {@link AudioStream}. Memory scales with the decode
 * buffer rather than the duration.
 *
 * It holds the element and default playback parameters but does not play
 * itself: `audio.play(media, options)` returns a voice for pause, resume, seek,
 * loop, rate, volume and spatial control. An element has a single playhead, so
 * there is **one active voice at a time** - playing again stops the previous
 * voice. Playback routes through the `music` bus by default.
 *
 * Use {@link Sound} for short, frequently triggered clips that benefit from a
 * decoded `AudioBuffer` and overlapping playback.
 */
export abstract class MediaAudio implements Playable {
  /**
   * Dispatched when the media fails after the asset was already usable - a
   * transfer that breaks mid-playback, or a decode error further into the file.
   *
   * A failure BEFORE the asset becomes ready fails the load instead, and is
   * reported by `Loader.onError`; this signal is the runtime counterpart, so
   * one load never appears to fail twice.
   */
  public readonly onError = new Signal<[error: Error]>();

  protected readonly _audioElement: HTMLMediaElement;

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
    this._onMediaError(new Error(mediaErrorMessage(this._audioElement, 'Audio playback failed.')));
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

  /** Media duration in seconds: `NaN` until metadata has loaded, `Infinity` for a live source. */
  public get duration(): number {
    return this._audioElement.duration;
  }

  /** Whether a voice can move the playhead. A voice ignores `seek` while this is `false`. */
  public abstract get seekable(): boolean;

  /**
   * `true` once {@link destroy} has run. A destroyed instance is not reusable -
   * playing it throws. Load the asset again to get a fresh one.
   */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /** The active voice, if one is playing. @internal */
  protected get _voice(): AudioStreamVoice | null {
    return this._activeVoice;
  }

  /**
   * Whether an `ended` event should retire the active voice. Live streams can recover.
   * @internal
   */
  protected _endVoiceOnMediaEnded(): boolean {
    return true;
  }

  /** Reports a media failure after the asset became usable. */
  protected _onMediaError(error: Error): void {
    this.onError.dispatch(error);
  }

  /**
   * Implements {@link Playable}. Called by {@link AudioSystem.play}.
   *
   * Stops any previously active voice (a stream has a single playhead), then
   * starts a fresh {@link AudioStreamVoice}.
   *
   * Throws on a destroyed stream. The check is unconditional, not `__DEV__`-only:
   * `createMediaElementSource()` may be called exactly once per media element,
   * and the second call raises `InvalidStateError` in the browser - a hard,
   * hard-to-trace runtime failure that a production build must not walk into.
   */
  public createVoice(system: AudioSystem, options: PlayOptions): Voice {
    if (this._destroyed) {
      throw new Error(
        `Cannot play a destroyed ${this.constructor.name}. \`destroy()\` releases the MediaElementAudioSourceNode that is ` +
          'permanently bound to the backing media element, and the Web Audio API allows only one such node per ' +
          'element — re-sourcing it would throw InvalidStateError. Load the asset again to obtain a fresh stream.',
      );
    }

    const bus = options.bus ?? system.music;
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
      system,
      volume,
      element: this._audioElement,
      sourceNode: this._sourceNode,
      loop,
      playbackRate,
      canSeek: () => this.seekable,
      endOnEnded: () => this._endVoiceOnMediaEnded(),
      ...(options._startHeld !== undefined && { startHeld: options._startHeld }),
      ...(options.time !== undefined && { startTime: options.time }),
    });

    seedVoiceFromPlayOptions(voice, options);
    seedVoiceSends(voice, options);

    this._activeVoice = voice;
    voice.onEnd.add((): void => {
      if (this._activeVoice === voice) {
        this._activeVoice = null;
      }
    });

    return voice;
  }

  /** Implements {@link Playable._profileVoice}. @internal */
  public _profileVoice(system: AudioSystem, options: PlayOptions): VoiceProfile {
    return {
      waitForUnlock: true,
      bus: options.bus ?? system.music,
      pausable: true,
      duration: this.duration,
      loop: options.loop ?? this.loop,
      playbackRate: clamp(options.playbackRate ?? this.playbackRate, 0.1, 20),
      detune: 0,
    };
  }

  /**
   * Stop the active voice and release the media graph. Terminal: the instance
   * cannot be played again afterwards (see {@link destroyed}).
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

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
