import { WorkletFilter } from './WorkletFilter';

const pitchShiftWorkletSource = `
class PitchShiftProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'pitch', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
            { name: 'wet', defaultValue: 1.0, minValue: 0, maxValue: 1.0, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const grainSize = options.processorOptions?.grainSize ?? 1024;
        this._grainSize = grainSize;
        this._bufferLength = grainSize * 4;
        this._buffer = new Float32Array(this._bufferLength);
        this._writePos = 0;
        // Two staggered read positions for overlap-add
        this._readPosA = 0;
        this._readPosB = grainSize / 2;
        this._hannWindow = this._buildHannWindow(grainSize);
    }

    _buildHannWindow(n) {
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return w;
    }

    _readGrain(readPos) {
        const grainSize = this._grainSize;
        const sampleIndex = Math.floor(readPos);
        const phase = sampleIndex % grainSize;  // position within the grain envelope
        const win = this._hannWindow[phase];
        const bufferIndex = ((this._writePos - this._bufferLength + sampleIndex) % this._bufferLength + this._bufferLength) % this._bufferLength;
        return this._buffer[bufferIndex] * win;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (!input || !output) return true;

        const pitch = parameters.pitch[0];
        const wet = parameters.wet[0];

        for (let i = 0; i < input.length; i++) {
            // Write to circular buffer
            this._buffer[this._writePos] = input[i];
            this._writePos = (this._writePos + 1) % this._bufferLength;

            // Read two grains and sum
            const grainA = this._readGrain(this._readPosA);
            const grainB = this._readGrain(this._readPosB);
            const shifted = grainA + grainB;

            // Mix with dry
            output[i] = (1 - wet) * input[i] + wet * shifted;

            // Advance read positions at pitch rate
            this._readPosA += pitch;
            this._readPosB += pitch;
            if (this._readPosA >= this._grainSize) this._readPosA -= this._grainSize;
            if (this._readPosB >= this._grainSize) this._readPosB -= this._grainSize;
        }
        return true;
    }
}
registerProcessor('exojs-pitch-shift', PitchShiftProcessor);
`;

export interface PitchShiftFilterOptions {
  /** Pitch ratio. 1.0 = no change, 0.5 = octave down, 2.0 = octave up. Default 1.0. */
  pitch?: number;
  /** Dry/wet mix, 0..1. Default 1.0 (full wet). */
  wet?: number;
  /**
   * Internal grain size in samples. Default 1024 (~21ms at 48kHz).
   * Larger = more delay but cleaner pitch shifting.
   */
  grainSize?: number;
}

/**
 * Real-time pitch shifter via granular synthesis (WorkletFilter).
 *
 * Quality: good for ±1 octave (pitch 0.5x-2.0x). Beyond that, audible
 * artifacts (graininess, phase issues). For high-quality pitch shift,
 * a phase-vocoder approach is required and not available in V1.
 *
 * Latency: ~half-grain-size = ~10ms at default 1024-sample grains
 * (at 48kHz sample rate). Not suitable for live monitoring; fine for
 * games / playback.
 *
 * Use cases:
 *   - Sound variation: random ±200 cent pitch on each footstep / bullet
 *   - Voice effects: chipmunk (1.5x) or demon (0.7x) for game NPCs
 *   - Detune layering: stack 0.99x and 1.01x for thick chorused sound
 */
export class PitchShiftFilter extends WorkletFilter {
  private _pitch: number;
  private _wet: number;
  private readonly _grainSize: number;

  public constructor(options: PitchShiftFilterOptions = {}) {
    super();
    this._pitch = Math.max(0.25, Math.min(4, options.pitch ?? 1));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 1));
    this._grainSize = options.grainSize ?? 1024;
  }

  protected get _workletName(): string {
    return 'exojs-pitch-shift';
  }

  protected get _workletSource(): string {
    return pitchShiftWorkletSource;
  }

  protected override get _workletOptions(): AudioWorkletNodeOptions {
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { grainSize: this._grainSize },
    };
  }

  protected override _onWorkletReady(): void {
    this._setAudioParam('pitch', this._pitch);
    this._setAudioParam('wet', this._wet);
  }

  /** Pitch ratio relative to the original. 1.0 = no change, 0.5 = one octave down, 2.0 = one octave up. Range 0.25..4.0, default 1.0. */
  public get pitch(): number {
    return this._pitch;
  }
  public set pitch(value: number) {
    this._pitch = Math.max(0.25, Math.min(4, value));
    this._setAudioParam('pitch', this._pitch);
  }

  /** Wet (pitch-shifted) mix level, 0..1. Default 1.0 (full wet). */
  public get wet(): number {
    return this._wet;
  }
  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    this._setAudioParam('wet', this._wet);
  }
}
