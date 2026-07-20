import { clamp } from '#math/utils';

import { isAudioContextReady, onAudioContextReady } from './audio-context';
import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import type { Loopable, Pausable, RatePitched, Seekable } from './Playable';

/** Construction parameters for {@link AudioStreamVoice}. */
export interface AudioStreamVoiceInit extends BaseVoiceInit {
  element: HTMLMediaElement;
  /** The element's `MediaElementAudioSourceNode` (owned by the {@link AudioStream}). */
  sourceNode: MediaElementAudioSourceNode;
  loop: boolean;
  playbackRate: number;
  /** Seek offset (seconds) to start at. */
  startTime?: number;
}

/**
 * Active playback handle for one {@link AudioStream} play call, backed by the
 * stream's `HTMLMediaElement` + `MediaElementAudioSourceNode`. Because the
 * element owns a single playhead, a stream has one active voice at a time —
 * starting a new voice stops the previous one.
 *
 * Mixes in {@link Seekable}, {@link Pausable}, {@link Loopable},
 * {@link RatePitched} (playback rate; `detune` is stored but inert — an
 * `HTMLMediaElement` has no detune control), and (via {@link BaseVoice})
 * {@link Spatializable}.
 *
 * @internal
 */
export class AudioStreamVoice extends BaseVoice implements Seekable, Pausable, Loopable, RatePitched {
  private readonly _element: HTMLMediaElement;
  private readonly _sourceNode: MediaElementAudioSourceNode;
  private _detune = 0;
  /**
   * User-facing base playback rate, cached independently of what's actually
   * written to `_element.playbackRate` — {@link AudioStreamVoice._applyDopplerRate}
   * multiplies from this cached base every tick, never from the live element
   * value, so consecutive Doppler ticks never compound onto each other's
   * already-modulated rate (mirrors {@link SoundVoice}'s `_playbackRate` cache).
   */
  private _basePlaybackRate: number;
  private readonly _onEnded = (): void => this._finish();
  private _unlockHandler: ((audioContext: AudioContext) => void) | null = null;

  public constructor(init: AudioStreamVoiceInit) {
    super(init);

    this._element = init.element;
    this._sourceNode = init.sourceNode;
    this._sourceNode.connect(this._output);

    this._element.loop = init.loop;
    this._basePlaybackRate = init.playbackRate;
    this._element.playbackRate = init.playbackRate;
    if (init.startTime !== undefined) {
      this._element.currentTime = Math.max(0, init.startTime);
    }

    this._element.addEventListener('ended', this._onEnded);
    this._startPlayback();
  }

  // -------------------------------------------------------------------------
  // Seekable
  // -------------------------------------------------------------------------

  public get duration(): number {
    return this._element.duration;
  }

  public get time(): number {
    return this._element.currentTime;
  }

  public set time(value: number) {
    this.seek(value);
  }

  public seek(t: number): void {
    if (this._ended) return;
    this._element.currentTime = Math.max(0, t);
  }

  // -------------------------------------------------------------------------
  // Pausable
  // -------------------------------------------------------------------------

  public pause(): void {
    if (!this._ended) this._element.pause();
  }

  public resume(): void {
    if (!this._ended) void this._element.play();
  }

  public get paused(): boolean {
    return this._element.paused;
  }

  // -------------------------------------------------------------------------
  // Loopable
  // -------------------------------------------------------------------------

  public get loop(): boolean {
    return this._element.loop;
  }

  public set loop(value: boolean) {
    this._element.loop = value;
  }

  // -------------------------------------------------------------------------
  // RatePitched
  // -------------------------------------------------------------------------

  public get playbackRate(): number {
    return this._basePlaybackRate;
  }

  public set playbackRate(value: number) {
    this._basePlaybackRate = clamp(value, 0.1, 20);
    this._element.playbackRate = this._basePlaybackRate;
  }

  /**
   * Pitch detune in cents. An `HTMLMediaElement` exposes no detune control, so
   * this value is stored but does not affect a stream — use {@link Sound} or
   * {@link AudioGenerator} when you need real detune.
   */
  public get detune(): number {
    return this._detune;
  }

  public set detune(value: number) {
    this._detune = value;
  }

  // -------------------------------------------------------------------------
  // BaseVoice hooks
  // -------------------------------------------------------------------------

  protected override _applyDopplerRate(ratio: number): void {
    if (this._ended) return;
    this._element.playbackRate = clamp(this._basePlaybackRate * ratio, 0.1, 20);
  }

  protected override _routeThroughPanner(panner: PannerNode): void {
    this._sourceNode.disconnect();
    this._sourceNode.connect(panner);
    panner.connect(this._output);
  }

  protected override _teardownSource(): void {
    this._element.removeEventListener('ended', this._onEnded);
    this._clearUnlockHandler();
    this._element.pause();
    this._sourceNode.disconnect();
  }

  /**
   * Start element playback. If the `AudioContext` is still locked by the
   * browser's autoplay policy, defer the start until the first user gesture
   * unlocks it.
   */
  private _startPlayback(): void {
    if (isAudioContextReady()) {
      void this._element.play();
      return;
    }

    this._unlockHandler = (): void => {
      this._clearUnlockHandler();
      if (!this._ended) void this._element.play();
    };
    onAudioContextReady.add(this._unlockHandler);
  }

  private _clearUnlockHandler(): void {
    if (this._unlockHandler !== null) {
      onAudioContextReady.remove(this._unlockHandler);
      this._unlockHandler = null;
    }
  }
}
