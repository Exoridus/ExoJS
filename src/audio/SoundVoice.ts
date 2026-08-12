import { clamp } from '#math/utils';

import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import type { Loopable, Pausable, RatePitched, Seekable } from './Playable';

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
 * Mixes in {@link Seekable}, {@link Loopable} and {@link Pausable} — all three
 * recreate the buffer source at the current position, since a source can be
 * neither repositioned, re-bounded, nor halted-and-restarted in place — plus
 * {@link RatePitched} and (via {@link BaseVoice}) {@link Spatializable}.
 *
 * **Pause is a stop-and-restart, not a freeze.** `pause()` reads the playhead
 * and throws the source away; `resume()` starts a fresh one at that offset. The
 * offset is sample-exact, but the restart is not phase-continuous: the new
 * source begins a new render quantum, so on sustained tonal material the seam
 * can be audible as a small click or phase step. Percussive and ambient
 * material hides it; a held pad may not.
 *
 * @internal
 */
export class SoundVoice extends BaseVoice implements Seekable, Loopable, RatePitched, Pausable {
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
  /**
   * `true` between {@link SoundVoice.pause} and {@link SoundVoice.resume}. While
   * set there is NO live source: `_source` still points at the retired node so
   * the field can stay non-nullable, but nothing may be scheduled on it and
   * nothing may start a replacement until `resume()`.
   */
  private _paused = false;
  /** Buffer offset (absolute seconds) the paused playhead sits at. */
  private _pausedAt = 0;

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
    // Paused: the context clock keeps running, the playhead does not.
    if (this._paused) return clamp(this._pausedAt - this._window.base, 0, span);
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

    // Paused: move the point playback will resume from. Starting a source here
    // would make a seek audibly un-pause the voice.
    if (this._paused) {
      this._pausedAt = offset;
      return;
    }

    this._restartSourceAt(offset);
  }

  // -------------------------------------------------------------------------
  // Pausable
  // -------------------------------------------------------------------------

  /**
   * Halt playback, keeping the playhead. A buffer source can be neither
   * repositioned nor stopped-and-restarted, so the running source is retired
   * outright — with its `onended` cleared first, so the teardown does not
   * finish the voice — and {@link SoundVoice.resume} starts a fresh one at the
   * remembered offset.
   *
   * The offset is sample-exact but the restart is not phase-continuous: on
   * sustained tonal material the seam can be audible.
   *
   * A voice whose source has already played out ends here instead of pausing —
   * see {@link SoundVoice._reachedWindowEnd}.
   */
  public pause(): void {
    if (this._ended || this._paused) return;

    // `onended` is an asynchronous task in a real browser, so a source can be
    // past its window end while the callback is still in flight. Retiring it
    // clears that callback, so pausing here would strand the voice as
    // permanently paused-but-not-ended: holding its pool slot, its entry in the
    // manager's voice registry, and its place in `SceneAudio._suspended`, with
    // nothing left that could ever finish it. It is over — end it properly.
    if (this._reachedWindowEnd()) {
      this._finish();

      return;
    }

    // Read the playhead before the flag flips — `time` reports the frozen
    // value once `_paused` is set.
    this._pausedAt = this._window.base + this.time;
    this._paused = true;
    this._retireSource();
  }

  /**
   * Whether the running source has already played past the end of its window.
   * Only meaningful for a non-looping voice — a looping source is bounded by
   * nothing and wraps forever.
   */
  private _reachedWindowEnd(): boolean {
    if (this._loop) return false;

    const elapsed = (this._audioContext.currentTime - this._startedAt) * this._playbackRate;

    return this._offsetAtStart + elapsed >= this._window.end;
  }

  public resume(): void {
    if (this._ended || !this._paused) return;

    this._paused = false;
    this._source = this._startSource(this._pausedAt);
    this._offsetAtStart = this._pausedAt;
    this._startedAt = this._audioContext.currentTime;
  }

  public get paused(): boolean {
    return this._paused;
  }

  // -------------------------------------------------------------------------
  // Loopable
  // -------------------------------------------------------------------------

  public get loop(): boolean {
    return this._loop;
  }

  public set loop(value: boolean) {
    // Paused too: there is no live source to re-bound, and `_startSource`
    // reads `_loop` when `resume()` builds the replacement, so recording the
    // flag is all that is needed — and all that is allowed.
    if (this._loop === value || this._ended || this._paused) {
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
    // Paused: no live param to ramp, and no playhead to re-base (`time` is
    // frozen). The resumed source picks the rate up from `_startSource`.
    if (this._playbackRate === rate || this._ended || this._paused) {
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
    if (!this._ended && !this._paused) {
      this._source.detune.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  // -------------------------------------------------------------------------
  // BaseVoice hooks
  // -------------------------------------------------------------------------

  protected override _applyDopplerRate(ratio: number): void {
    // Paused: the per-frame spatial tick still runs (the voice is not ended and
    // stays registered), but there is no live rate param to modulate. The
    // ratio is recomputed on the next tick after resume anyway.
    if (this._ended || this._paused) return;
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
    this._retireSource();
  }

  /**
   * Stop and disconnect the current buffer source, clearing its `onended`
   * first so retiring it never finishes the voice. Idempotent: an already
   * stopped or already disconnected node is fine, which is what lets
   * {@link SoundVoice.pause} and a later `_finish()` both call it.
   */
  private _retireSource(): void {
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
   * the only way to change where playback sits or where it must end.
   */
  private _restartSourceAt(offset: number): void {
    this._retireSource();

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
