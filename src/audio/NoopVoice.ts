import { Signal } from '#core/Signal';

import { getAudioContext } from './audio-context';
import type { AudioBus } from './AudioBus';
import type { AudioEffect } from './AudioEffect';
import type { Voice } from './Playable';

/**
 * An already-ended {@link Voice} returned for degenerate play calls — a seek
 * offset past the asset's duration, or a generator played before the
 * `AudioContext` is unlocked. All controls are inert; `ended` is `true` from
 * the start and {@link NoopVoice.onEnd} never fires.
 *
 * @internal
 */
export class NoopVoice implements Voice {
  public readonly onEnd = new Signal();
  private readonly _bus: AudioBus;
  private _output: AudioNode | null = null;

  public constructor(bus: AudioBus) {
    this._bus = bus;
  }

  public get ended(): boolean {
    return true;
  }

  public get output(): AudioNode {
    return (this._output ??= getAudioContext().createGain());
  }

  public get volume(): number {
    return 0;
  }

  public set volume(_value: number) {
    // inert — the voice already ended
  }

  public get bus(): AudioBus {
    return this._bus;
  }

  public set bus(_bus: AudioBus) {
    // inert — the voice already ended
  }

  public fade(_to: number, _ms: number): void {
    // inert — the voice already ended
  }

  public stop(_fadeMs?: number): void {
    // inert — the voice already ended
  }

  public addEffect(_effect: AudioEffect): this {
    return this;
  }

  public removeEffect(_effect: AudioEffect): this {
    return this;
  }
}
