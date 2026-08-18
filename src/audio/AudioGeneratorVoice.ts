import type { OscillatorType } from './AudioGenerator';
import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import type { Envelope } from './Envelope';
import type { Pausable, RatePitched } from './Playable';

/** Construction parameters for {@link AudioGeneratorVoice}. */
export interface AudioGeneratorVoiceInit extends BaseVoiceInit {
  frequency: number;
  type: OscillatorType;
  detune: number;
  envelope: Envelope | null;
}

/**
 * Active playback handle for one {@link AudioGenerator} play call, backed by an
 * `OscillatorNode` plus a per-voice envelope gain. Each `AudioManager.play`
 * creates an independent voice.
 *
 * Exposes the generator parameters (`frequency`, `type`), mixes in
 * {@link RatePitched} (`detune` is real; `playbackRate` is stored but inert — an
 * oscillator has no playback rate, retune via `frequency`/`detune`) and
 * {@link Pausable}, and (via {@link BaseVoice}) {@link Spatializable}.
 *
 * Graph: `oscillator → envelopeGain → [panner] → output(volume) → bus`. The
 * envelope shapes the ADSR; the output gain carries the overall volume.
 *
 * **Pause retires the oscillator, it does not mute it.** An `OscillatorNode`
 * cannot be halted and restarted, so {@link AudioGeneratorVoice.pause} throws
 * the running one away and {@link AudioGeneratorVoice.resume} starts a fresh
 * one from the voice's current `type`/`frequency`/`detune` — a paused scene
 * must not keep an oscillator synthesizing. The envelope is frozen at its pause
 * point and re-scheduled from there on resume, so a held note does not run
 * through its attack while inaudible. Only the waveform phase is lost, which is
 * inaudible across the silence the pause itself creates.
 *
 * @internal
 */
export class AudioGeneratorVoice extends BaseVoice implements RatePitched, Pausable {
  private _oscillator: OscillatorNode;
  private readonly _envelopeGain: GainNode;
  private readonly _envelope: Envelope | null;
  private _frequency: number;
  private _type: OscillatorType;
  private _detune: number;
  private _playbackRate = 1;
  /**
   * `true` between {@link AudioGeneratorVoice.pause} and
   * {@link AudioGeneratorVoice.resume}. While set there is NO live oscillator:
   * `_oscillator` still points at the retired node so the field can stay
   * non-nullable, but nothing may be scheduled on it and nothing may start a
   * replacement until `resume()`.
   */
  private _paused = false;
  /**
   * `true` once a stop is in flight — an envelope release or a timed fade —
   * and the voice is only waiting to be finished. Such a voice can no longer be
   * paused, only ended.
   */
  private _stopping = false;
  /** Context time the currently-scheduled envelope counts its stages from. */
  private _envelopeStartedAt: number;
  /** Envelope progress (ms) frozen at the last {@link AudioGeneratorVoice.pause}. */
  private _envelopeElapsedMs = 0;

  public constructor(init: AudioGeneratorVoiceInit) {
    super(init);

    const ctx = this._audioContext;
    const now = ctx.currentTime;

    this._frequency = init.frequency;
    this._type = init.type;
    this._detune = init.detune;
    this._envelope = init.envelope;

    this._envelopeGain = ctx.createGain();
    this._envelopeGain.connect(this._output);
    this._envelopeStartedAt = now;

    if (this._envelope) {
      this._envelope.trigger(this._envelopeGain.gain, now);
    } else {
      this._envelopeGain.gain.value = 1;
    }

    this._oscillator = this._startOscillator();
  }

  // -------------------------------------------------------------------------
  // Generator parameters
  // -------------------------------------------------------------------------

  public get frequency(): number {
    return this._frequency;
  }

  public set frequency(value: number) {
    this._frequency = value;
    // Paused: no live oscillator to ramp. `_startOscillator` reads the field, so
    // the value resume starts from is this one, not the one the pause froze.
    if (!this._ended && !this._paused) {
      this._oscillator.frequency.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  public get type(): OscillatorType {
    return this._type;
  }

  public set type(value: OscillatorType) {
    this._type = value;
    if (!this._ended && !this._paused) {
      this._oscillator.type = value;
    }
  }

  // -------------------------------------------------------------------------
  // RatePitched
  // -------------------------------------------------------------------------

  /**
   * Stored but inert — an `OscillatorNode` has no playback rate. Retune via
   * {@link AudioGeneratorVoice.frequency} or {@link AudioGeneratorVoice.detune}.
   */
  public get playbackRate(): number {
    return this._playbackRate;
  }

  public set playbackRate(value: number) {
    this._playbackRate = value;
  }

  public get detune(): number {
    return this._detune;
  }

  public set detune(value: number) {
    this._detune = value;
    if (!this._ended && !this._paused) {
      this._oscillator.detune.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  // -------------------------------------------------------------------------
  // Pausable
  // -------------------------------------------------------------------------

  /**
   * Halt playback, keeping the envelope where it stands. An `OscillatorNode`
   * can be neither repositioned nor stopped-and-restarted, so the running one
   * is retired outright — with its `onended` cleared first, so the teardown does
   * not finish the voice — and {@link AudioGeneratorVoice.resume} starts a fresh
   * one.
   *
   * The envelope is frozen at the value it has reached and its pending
   * automation cancelled: left alone it would keep ramping against
   * `audioContext.currentTime` and a held note would silently run through its
   * attack and decay while the scene was paused.
   *
   * A voice that is already stopping — an envelope release or a timed fade is in
   * flight — ends here instead of pausing: nothing audible is left to freeze,
   * and retiring the oscillator would clear the `onended` that is the only thing
   * left to finish it.
   */
  public pause(): void {
    if (this._ended || this._paused) return;

    if (this._stopping) {
      this._finish();

      return;
    }

    const now = this._audioContext.currentTime;

    if (this._envelope) {
      // Clamped at the sustain point: past it the envelope holds a constant
      // level, so a longer elapsed time carries no extra information and would
      // only push the virtual trigger point further into the past on every
      // pause of a long-held note.
      this._envelopeElapsedMs = Math.min((now - this._envelopeStartedAt) * 1000, this._envelope.attackMs + this._envelope.decayMs);
      this._envelope.hold(this._envelopeGain.gain, now);
    }

    this._paused = true;
    this._retireOscillator();
  }

  /**
   * Start a fresh oscillator and pick the envelope up where
   * {@link AudioGeneratorVoice.pause} froze it. The replacement is built from
   * the voice's current `type`/`frequency`/`detune`, so a retune applied while
   * paused takes effect here rather than being reverted to the value at pause
   * time.
   */
  public resume(): void {
    if (this._ended || !this._paused) return;

    const now = this._audioContext.currentTime;

    this._paused = false;

    if (this._envelope) {
      this._envelope.trigger(this._envelopeGain.gain, now, this._envelopeElapsedMs);
      this._envelopeStartedAt = now - this._envelopeElapsedMs / 1000;
    }

    this._oscillator = this._startOscillator();
  }

  public get paused(): boolean {
    return this._paused;
  }

  // -------------------------------------------------------------------------
  // Stop (envelope-aware)
  // -------------------------------------------------------------------------

  public override stop(fadeMs?: number): void {
    if (this._ended) return;

    // Paused: there is no live oscillator to release or fade out, so both timed
    // paths would only keep an inaudible voice alive for their own duration.
    if (this._paused) {
      this._finish();
      return;
    }

    if (fadeMs !== undefined && fadeMs > 0) {
      this._stopping = true;
      super.stop(fadeMs);
      return;
    }

    if (this._envelope) {
      const now = this._audioContext.currentTime;
      this._stopping = true;
      this._envelope.release(this._envelopeGain.gain, now);
      const stopAt = now + this._envelope.releaseMs / 1000;
      try {
        this._oscillator.stop(stopAt);
      } catch {
        // already stopped
      }
      // _finish runs on the oscillator's onended at stopAt.
      return;
    }

    super.stop();
  }

  // -------------------------------------------------------------------------
  // BaseVoice hooks
  // -------------------------------------------------------------------------

  protected override _routeThroughPanner(panner: PannerNode): void {
    this._envelopeGain.disconnect();
    this._envelopeGain.connect(panner);
    panner.connect(this._output);
  }

  protected override _routeDirect(): void {
    this._envelopeGain.disconnect();
    this._envelopeGain.connect(this._output);
  }

  protected override _teardownSource(): void {
    this._retireOscillator();
    this._envelopeGain.disconnect();
  }

  /**
   * Stop and disconnect the current oscillator, clearing its `onended` first so
   * retiring it never finishes the voice. Idempotent: an already stopped or
   * already disconnected node is fine, which is what lets
   * {@link AudioGeneratorVoice.pause} and a later `_finish()` both call it.
   */
  private _retireOscillator(): void {
    this._oscillator.onended = null;
    try {
      this._oscillator.stop(0);
    } catch {
      // already stopped
    }
    this._oscillator.disconnect();
  }

  /** Create, connect, and start an oscillator from the voice's current parameters. */
  private _startOscillator(): OscillatorNode {
    const ctx = this._audioContext;
    const oscillator = ctx.createOscillator();

    oscillator.type = this._type;
    oscillator.frequency.value = this._frequency;
    oscillator.detune.value = this._detune;
    // Always into the envelope gain: the panner (when one exists) sits after it,
    // so the source end of the chain is the same before and after a pause.
    oscillator.connect(this._envelopeGain);
    oscillator.onended = (): void => this._finish();
    oscillator.start(ctx.currentTime);

    return oscillator;
  }
}
