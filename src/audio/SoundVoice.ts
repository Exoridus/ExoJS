import { clamp } from '#math/utils';

import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import type { Loopable, RatePitched, Seekable } from './Playable';

/** Playback window within the buffer for a {@link SoundVoice}. */
export interface SoundVoiceWindow {
  /** Buffer offset (seconds) where this voice's span begins — 0 for a full sound, `clip.start` for a sprite. */
  base: number;
  /** Buffer offset (seconds) where playback ends — buffer duration for a full sound, `clip.end` for a sprite. */
  end: number;
  /** Loop window start (seconds). */
  loopStart: number;
  /** Loop window end (seconds). */
  loopEnd: number;
}

/** Construction parameters for {@link SoundVoice}. */
export interface SoundVoiceInit extends BaseVoiceInit {
  buffer: AudioBuffer;
  loop: boolean;
  playbackRate: number;
  detune: number;
  /** Buffer offset (seconds) to start playback at. */
  offset: number;
  window: SoundVoiceWindow;
}

/**
 * Active playback handle for one {@link Sound} play call, backed by a single
 * `AudioBufferSourceNode`. Each `AudioManager.play(sound)` creates an
 * independent SoundVoice; concurrent plays each get their own.
 *
 * Mixes in {@link Seekable} (live seek recreates the buffer source at the new
 * offset — buffer sources cannot be repositioned in place), {@link Loopable},
 * {@link RatePitched}, and (via {@link BaseVoice}) {@link Spatializable}.
 *
 * @internal
 */
export class SoundVoice extends BaseVoice implements Seekable, Loopable, RatePitched {
  private readonly _buffer: AudioBuffer;
  private readonly _window: SoundVoiceWindow;
  private _source: AudioBufferSourceNode;
  private _loop: boolean;
  private _playbackRate: number;
  private _detune: number;
  /** Buffer offset the current source was started at. */
  private _offsetAtStart: number;
  /** `audioContext.currentTime` when the current source started. */
  private _startedAt: number;

  public constructor(init: SoundVoiceInit) {
    super(init);

    this._buffer = init.buffer;
    this._window = init.window;
    this._loop = init.loop;
    this._playbackRate = init.playbackRate;
    this._detune = init.detune;
    this._offsetAtStart = init.offset;
    this._startedAt = this._audioContext.currentTime;
    this._source = this._startSource(init.offset);
  }

  // -------------------------------------------------------------------------
  // Seekable
  // -------------------------------------------------------------------------

  /** Playback span in seconds (`end - base` of the window). */
  public get duration(): number {
    return this._window.end - this._window.base;
  }

  public get time(): number {
    if (this._ended) return 0;
    const span = this.duration;
    const elapsed = (this._audioContext.currentTime - this._startedAt) * this._playbackRate;
    let pos = this._offsetAtStart - this._window.base + elapsed;
    if (this._loop && span > 0) {
      pos %= span;
      if (pos < 0) pos += span;
    }
    return clamp(pos, 0, span);
  }

  public set time(value: number) {
    this.seek(value);
  }

  public seek(t: number): void {
    if (this._ended) return;

    const offset = this._window.base + clamp(t, 0, this.duration);

    // Buffer sources can't be repositioned — stop the current one (without
    // letting its onended finish the voice) and start a fresh source.
    this._source.onended = null;
    try {
      this._source.stop(0);
    } catch {
      // already stopped
    }
    this._source.disconnect();

    this._source = this._startSource(offset);
    this._offsetAtStart = offset;
    this._startedAt = this._audioContext.currentTime;
  }

  // -------------------------------------------------------------------------
  // Loopable
  // -------------------------------------------------------------------------

  public get loop(): boolean {
    return this._loop;
  }

  public set loop(value: boolean) {
    if (this._loop === value || this._ended) {
      this._loop = value;
      return;
    }
    this._loop = value;
    this._source.loop = value;
    if (value) {
      this._source.loopStart = this._window.loopStart;
      this._source.loopEnd = this._window.loopEnd;
    }
  }

  // -------------------------------------------------------------------------
  // RatePitched
  // -------------------------------------------------------------------------

  public get playbackRate(): number {
    return this._playbackRate;
  }

  public set playbackRate(value: number) {
    const rate = clamp(value, 0.1, 20);
    if (this._playbackRate === rate || this._ended) {
      this._playbackRate = rate;
      return;
    }
    // Re-base the playhead so `time` stays consistent across the rate change.
    const pos = this.time;
    this._playbackRate = rate;
    this._offsetAtStart = this._window.base + pos;
    this._startedAt = this._audioContext.currentTime;
    this._source.playbackRate.setTargetAtTime(rate, this._audioContext.currentTime, 0.01);
  }

  public get detune(): number {
    return this._detune;
  }

  public set detune(value: number) {
    this._detune = value;
    if (!this._ended) {
      this._source.detune.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  // -------------------------------------------------------------------------
  // BaseVoice hooks
  // -------------------------------------------------------------------------

  protected override _routeThroughPanner(panner: PannerNode): void {
    this._source.disconnect();
    this._source.connect(panner);
    panner.connect(this._output);
  }

  protected override _teardownSource(): void {
    this._source.onended = null;
    try {
      this._source.stop(0);
    } catch {
      // already stopped
    }
    this._source.disconnect();
  }

  /** Create, connect, and start a buffer source at `offset` seconds. */
  private _startSource(offset: number): AudioBufferSourceNode {
    const ctx = this._audioContext;
    const source = ctx.createBufferSource();
    source.buffer = this._buffer;
    source.loop = this._loop;
    source.playbackRate.value = this._playbackRate;
    source.detune.value = this._detune;

    if (this._loop) {
      source.loopStart = this._window.loopStart;
      source.loopEnd = this._window.loopEnd;
    }

    source.connect(this._panner ?? this._output);
    source.onended = (): void => this._finish();

    const playDuration = this._loop ? undefined : this._window.end - offset;
    if (!this._loop && playDuration !== undefined && playDuration > 0) {
      source.start(0, offset, playDuration);
    } else {
      source.start(0, offset);
    }

    return source;
  }
}
