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
 * Mixes in {@link Seekable} and {@link Loopable} — both recreate the buffer
 * source at the current position, since a source can be neither repositioned
 * nor re-bounded in place — plus {@link RatePitched} and (via
 * {@link BaseVoice}) {@link Spatializable}.
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

    this._restartSourceAt(this._window.base + clamp(t, 0, this.duration));
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

    // Read the playhead before the flag flips — `time` wraps modulo the span
    // while looping, and the value needed below is the pre-change position.
    const position = this.time;

    this._loop = value;

    // The clip window is an invariant of the voice, not a property of the loop
    // flag — and a buffer source can be neither repositioned nor re-bounded in
    // place, so flipping `loop` on the live source is not enough in either
    // direction:
    //
    // - A non-looping start is capped by `start()`'s `duration`, which the
    //   spec measures over all played content "including any whole or partial
    //   loop iterations". Enabling loop would not lift that cap; the source
    //   would still end at the clip end and finish the voice.
    // - A looping start carries no cap at all. Disabling loop would let the
    //   source run on to the end of the whole buffer and bleed into whatever
    //   sprite comes next in the atlas.
    //
    // Rebuilding at the current position settles both: the fresh source gets
    // exactly the bound the new mode calls for, expressed in buffer time and
    // therefore immune to later rate changes and to the per-frame Doppler
    // modulation, and the restart rebases the playhead so `time` keeps
    // reporting correctly across the switch.
    this._restartSourceAt(this._window.base + position);
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

  protected override _applyDopplerRate(ratio: number): void {
    if (this._ended) return;
    this._source.playbackRate.setTargetAtTime(this._playbackRate * ratio, this._audioContext.currentTime, 0.01);
  }

  protected override _routeThroughPanner(panner: PannerNode): void {
    this._source.disconnect();
    this._source.connect(panner);
    panner.connect(this._output);
  }

  protected override _routeDirect(): void {
    this._source.disconnect();
    this._source.connect(this._output);
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

  /**
   * Retire the running buffer source and start a fresh one at `offset`
   * (absolute buffer seconds), rebasing the playhead bookkeeping. Buffer
   * sources can be neither repositioned nor re-bounded in place, so this is
   * the only way to change where playback sits or where it must end. The old
   * source's `onended` is cleared first so the swap does not finish the voice.
   */
  private _restartSourceAt(offset: number): void {
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

  /** Create, connect, and start a buffer source at `offset` seconds. */
  private _startSource(offset: number): AudioBufferSourceNode {
    const ctx = this._audioContext;
    const source = ctx.createBufferSource();
    source.buffer = this._buffer;
    source.loop = this._loop;
    source.playbackRate.value = this._playbackRate;
    source.detune.value = this._detune;

    // Always stamped, not only for a looping start: the loop window belongs to
    // the voice's clip, so enabling loop later must not have to reconstruct it
    // from state the source no longer carries.
    source.loopStart = this._window.loopStart;
    source.loopEnd = this._window.loopEnd;

    source.connect(this._panner ?? this._output);
    source.onended = (): void => this._finish();

    if (this._loop) {
      source.start(0, offset);
    } else {
      // Always capped, including when nothing is left to play: `seek()` clamps
      // inclusively, so an offset exactly at the window end must render silence
      // and end the voice rather than fall through to an uncapped start that
      // would spill into the rest of the atlas buffer.
      source.start(0, offset, Math.max(0, this._window.end - offset));
    }

    return source;
  }
}
