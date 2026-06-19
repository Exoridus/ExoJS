import type { AudioBus } from '#audio/AudioBus';
import { WorkletEffect } from '#audio/WorkletEffect';

const duckingWorkletSource = `
class DuckingProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'threshold', defaultValue: -20, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
            { name: 'ratio', defaultValue: 4, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
            { name: 'attack', defaultValue: 0.03, minValue: 0.001, maxValue: 1, automationRate: 'k-rate' },
            { name: 'release', defaultValue: 0.3, minValue: 0.001, maxValue: 5, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this._envelope = 0;
    }

    process(inputs, outputs, parameters) {
        const main = inputs[0];
        const sidechain = inputs[1];
        const output = outputs[0];

        if (!main || main.length === 0 || !output || output.length === 0) {
            return true;
        }

        const threshold = parameters.threshold[0];
        const ratio = parameters.ratio[0];
        const attackCoeff = parameters.attack[0];
        const releaseCoeff = parameters.release[0];

        const blockLength = main[0]?.length ?? 0;
        for (let i = 0; i < blockLength; i++) {
            // Sidechain RMS sample (mono-mix L+R for detection)
            let scSample = 0;
            if (sidechain && sidechain.length > 0) {
                const left = sidechain[0]?.[i] ?? 0;
                const right = sidechain[1]?.[i] ?? left;
                scSample = (Math.abs(left) + Math.abs(right)) * 0.5;
            }

            // Envelope follower
            const coeff = scSample > this._envelope ? attackCoeff : releaseCoeff;
            this._envelope += (scSample - this._envelope) * coeff;

            // Compute gain reduction in dB
            const envDb = 20 * Math.log10(this._envelope + 1e-9);
            const overshoot = Math.max(0, envDb - threshold);
            const reduction = overshoot * (1 - 1 / ratio);
            const gain = Math.pow(10, -reduction / 20);

            // Apply to all main channels
            for (let ch = 0; ch < main.length; ch++) {
                const mainCh = main[ch];
                const outCh = output[ch];
                if (mainCh && outCh && i < mainCh.length) {
                    outCh[i] = mainCh[i] * gain;
                }
            }
        }

        return true;
    }
}
registerProcessor('exojs-ducking', DuckingProcessor);
`;

/** Construction options for {@link DuckingFilter}. `sidechain` is required. */
export interface DuckingFilterOptions {
  sidechain: AudioBus;
  threshold?: number;
  ratio?: number;
  attackMs?: number;
  releaseMs?: number;
}

/**
 * Sidechain compressor (ducker) implemented as an {@link WorkletEffect}.
 * Attenuates the main audio signal whenever the `sidechain` {@link AudioBus}
 * exceeds the threshold, then releases when it drops back down. Commonly used
 * to duck background music under dialogue or sound effects. Attack and release
 * times are expressed in milliseconds and converted internally to one-pole
 * filter coefficients.
 */
export class DuckingFilter extends WorkletEffect {
  // Declared nullable because super() may trigger _onWorkletReady before the
  // subclass constructor body runs (if construction is aborted by a throw).
  private readonly _sidechain: AudioBus | null = null;
  private _threshold: number;
  private _ratio: number;
  private _attackMs: number;
  private _releaseMs: number;

  public constructor(options: DuckingFilterOptions) {
    super();
    if (!options.sidechain) {
      throw new Error('DuckingFilter requires a sidechain AudioBus.');
    }
    this._sidechain = options.sidechain;
    this._threshold = options.threshold ?? -20;
    this._ratio = options.ratio ?? 4;
    this._attackMs = options.attackMs ?? 30;
    this._releaseMs = options.releaseMs ?? 300;
  }

  protected get _workletName(): string {
    return 'exojs-ducking';
  }

  protected get _workletSource(): string {
    return duckingWorkletSource;
  }

  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return { numberOfInputs: 2, numberOfOutputs: 1 };
  }

  protected override _onWorkletReady(audioContext: AudioContext): void {
    // Guard against partially-constructed instances (constructor threw after super()).
    if (!this._sidechain) return;

    // Apply current parameter values
    this._setAudioParam('threshold', this._threshold);
    this._setAudioParam('ratio', this._ratio);
    this._setAudioParam('attack', this._msToCoeff(this._attackMs, audioContext.sampleRate));
    this._setAudioParam('release', this._msToCoeff(this._releaseMs, audioContext.sampleRate));

    // Wire sidechain to input 1 of the worklet
    const sidechain = this._sidechain;
    const sidechainOut = sidechain._getOutputNode();
    if (sidechainOut && this._workletNode) {
      sidechainOut.connect(this._workletNode, 0, 1);
    } else {
      sidechain.onceSetup(() => {
        const node = sidechain._getOutputNode();
        if (node && this._workletNode) {
          node.connect(this._workletNode, 0, 1);
        }
      });
    }
  }

  /** Convert ms time-constant to one-pole filter coefficient at given sample rate. */
  private _msToCoeff(ms: number, sampleRate: number): number {
    const tau = ms * 0.001 * sampleRate;
    return 1 - Math.exp(-1 / Math.max(1, tau));
  }

  /** Sidechain level above which the main signal is attenuated, in dBFS. Range −100..0, default −20. */
  public get threshold(): number {
    return this._threshold;
  }
  public set threshold(value: number) {
    this._threshold = Math.max(-100, Math.min(0, value));
    this._setAudioParam('threshold', this._threshold);
  }

  /** Compression ratio applied to the main signal above the threshold. Range 1..20, default 4. */
  public get ratio(): number {
    return this._ratio;
  }
  public set ratio(value: number) {
    this._ratio = Math.max(1, Math.min(20, value));
    this._setAudioParam('ratio', this._ratio);
  }

  /** Attack time in milliseconds — how quickly the ducker engages. Default 30. */
  public get attackMs(): number {
    return this._attackMs;
  }
  public set attackMs(value: number) {
    this._attackMs = Math.max(0.001, value);
    if (this._workletNode) {
      this._setAudioParam('attack', this._msToCoeff(this._attackMs, this._workletNode.context.sampleRate));
    }
  }

  /** Release time in milliseconds — how quickly the ducker disengages. Default 300. */
  public get releaseMs(): number {
    return this._releaseMs;
  }
  public set releaseMs(value: number) {
    this._releaseMs = Math.max(0.001, value);
    if (this._workletNode) {
      this._setAudioParam('release', this._msToCoeff(this._releaseMs, this._workletNode.context.sampleRate));
    }
  }
}
