import type { OscillatorType } from './AudioGenerator';
import { BaseVoice, type BaseVoiceInit } from './BaseVoice';
import type { Envelope } from './Envelope';
import type { RatePitched } from './Playable';

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
 * oscillator has no playback rate, retune via `frequency`/`detune`), and (via
 * {@link BaseVoice}) {@link Spatializable}.
 *
 * Graph: `oscillator → envelopeGain → [panner] → output(volume) → bus`. The
 * envelope shapes the ADSR; the output gain carries the overall volume.
 *
 * @internal
 */
export class AudioGeneratorVoice extends BaseVoice implements RatePitched {
  private readonly _oscillator: OscillatorNode;
  private readonly _envelopeGain: GainNode;
  private readonly _envelope: Envelope | null;
  private _frequency: number;
  private _type: OscillatorType;
  private _detune: number;
  private _playbackRate = 1;

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

    const oscillator = ctx.createOscillator();
    oscillator.type = init.type;
    oscillator.frequency.value = init.frequency;
    oscillator.detune.value = init.detune;
    oscillator.connect(this._envelopeGain);
    oscillator.onended = (): void => this._finish();

    if (this._envelope) {
      this._envelope.trigger(this._envelopeGain.gain, now);
    } else {
      this._envelopeGain.gain.value = 1;
    }

    oscillator.start(now);
    this._oscillator = oscillator;
  }

  // -------------------------------------------------------------------------
  // Generator parameters
  // -------------------------------------------------------------------------

  public get frequency(): number {
    return this._frequency;
  }

  public set frequency(value: number) {
    this._frequency = value;
    if (!this._ended) {
      this._oscillator.frequency.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  public get type(): OscillatorType {
    return this._type;
  }

  public set type(value: OscillatorType) {
    this._type = value;
    if (!this._ended) {
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
    if (!this._ended) {
      this._oscillator.detune.setTargetAtTime(value, this._audioContext.currentTime, 0.01);
    }
  }

  // -------------------------------------------------------------------------
  // Stop (envelope-aware)
  // -------------------------------------------------------------------------

  public override stop(fadeMs?: number): void {
    if (this._ended) return;

    if (fadeMs !== undefined && fadeMs > 0) {
      super.stop(fadeMs);
      return;
    }

    if (this._envelope) {
      const now = this._audioContext.currentTime;
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

  protected override _teardownSource(): void {
    this._oscillator.onended = null;
    try {
      this._oscillator.stop(0);
    } catch {
      // already stopped
    }
    this._oscillator.disconnect();
    this._envelopeGain.disconnect();
  }
}
