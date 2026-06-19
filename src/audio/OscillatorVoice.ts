import { clamp } from '#math/utils';

import type { Envelope } from './Envelope';
import type { Voice } from './Playable';

/**
 * Active playback handle for one {@link OscillatorSound} play call.
 *
 * Each call to `AudioManager.play(oscillatorSound)` creates an independent
 * OscillatorVoice backed by one `OscillatorNode` + a per-voice `GainNode`
 * for envelope support.
 *
 * @internal
 */
export class OscillatorVoice implements Voice {
  private readonly _oscillator: OscillatorNode;
  private readonly _voiceGain: GainNode;
  private readonly _audioContext: AudioContext;
  private readonly _envelope: Envelope | null;
  private _ended = false;
  private _stopScheduledId: ReturnType<typeof setTimeout> | null = null;

  public get ended(): boolean {
    return this._ended;
  }

  public constructor(
    audioContext: AudioContext,
    oscillator: OscillatorNode,
    voiceGain: GainNode,
    envelope: Envelope | null,
  ) {
    this._audioContext = audioContext;
    this._oscillator = oscillator;
    this._voiceGain = voiceGain;
    this._envelope = envelope;

    oscillator.onended = (): void => {
      this._markEnded();
    };
  }

  public stop(): void {
    if (this._ended) return;
    this._clearStopSchedule();
    this._stopWithEnvelope();
  }

  public setVolume(volume: number): void {
    const v = clamp(volume, 0, 2);
    this._voiceGain.gain.setTargetAtTime(v, this._audioContext.currentTime, 0.01);
  }

  public fadeOut(durationMs: number): void {
    if (this._ended) return;

    if (durationMs <= 0) {
      this.stop();
      return;
    }

    const ctx = this._audioContext;
    const node = this._voiceGain;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
    node.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

    this._clearStopSchedule();
    this._stopScheduledId = setTimeout(() => {
      this._stopScheduledId = null;
      this.stop();
    }, durationMs);
  }

  private _stopWithEnvelope(): void {
    const ctx = this._audioContext;
    const now = ctx.currentTime;

    if (this._envelope) {
      this._envelope.release(this._voiceGain.gain, now);
      const stopAt = now + this._envelope.releaseMs / 1000;
      try {
        this._oscillator.stop(stopAt);
      } catch {
        // already stopped
      }
    } else {
      try {
        this._oscillator.stop(now);
      } catch {
        // already stopped
      }
      this._oscillator.disconnect();
      this._voiceGain.disconnect();
    }

    this._markEnded();
  }

  private _clearStopSchedule(): void {
    if (this._stopScheduledId !== null) {
      clearTimeout(this._stopScheduledId);
      this._stopScheduledId = null;
    }
  }

  private _markEnded(): void {
    if (!this._ended) {
      this._ended = true;
      this._clearStopSchedule();
    }
  }
}
