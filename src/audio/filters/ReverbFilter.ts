import { getAudioContext, isAudioContextReady, onAudioContextReady } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

/** Construction options for {@link ReverbFilter}. */
export interface ReverbFilterOptions {
  durationSeconds?: number;
  decay?: number;
  wet?: number;
}

interface ReverbFilterSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly convolver: ConvolverNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
}

/**
 * Convolution reverb using a procedurally-generated impulse response loaded
 * into a `ConvolverNode`. The impulse response is a stereo noise burst whose
 * amplitude decays exponentially, simulating room reflections. Adjusting
 * `durationSeconds` or `decay` rebuilds the impulse response immediately, so
 * avoid animating these properties at audio rate — use `wet` for real-time
 * mix control instead.
 */
export class ReverbFilter extends AudioFilter {
  private _setup: ReverbFilterSetup | null = null;
  private _duration: number;
  private _decay: number;
  private _wet: number;

  public constructor(options: ReverbFilterOptions = {}) {
    super();
    this._duration = Math.max(0.1, Math.min(5, options.durationSeconds ?? 2));
    this._decay = Math.max(0.5, Math.min(10, options.decay ?? 2));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.4));
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.once(this._setupNodes, this);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._setup) throw new Error('ReverbFilter not yet initialized.');
    return this._setup.inputGain;
  }

  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('ReverbFilter not yet initialized.');
    return this._setup.outputGain;
  }

  /** Length of the generated impulse response in seconds. Range 0.1..5, default 2. Changing this rebuilds the IR buffer. */
  public get durationSeconds(): number {
    return this._duration;
  }

  public set durationSeconds(value: number) {
    this._duration = Math.max(0.1, Math.min(5, value));
    if (this._setup) {
      this._setup.convolver.buffer = this._generateImpulseResponse(this._setup.convolver.context as AudioContext);
    }
  }

  /** Exponential decay rate of the impulse response. Higher values produce a tighter, drier reverb tail. Range 0.5..10, default 2. Changing this rebuilds the IR buffer. */
  public get decay(): number {
    return this._decay;
  }

  public set decay(value: number) {
    this._decay = Math.max(0.5, Math.min(10, value));
    if (this._setup) {
      this._setup.convolver.buffer = this._generateImpulseResponse(this._setup.convolver.context as AudioContext);
    }
  }

  /** Wet (reverberated) mix level, 0..1. The dry level is automatically `1 - wet`. Default 0.4. */
  public get wet(): number {
    return this._wet;
  }

  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._setup) {
      const ctx = this._setup.wetGain.context;
      this._setup.wetGain.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01);
      this._setup.dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
    }
  }

  public override destroy(): void {
    onAudioContextReady.clearByContext(this);
    if (this._setup) {
      this._setup.inputGain.disconnect();
      this._setup.convolver.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  private _generateImpulseResponse(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * this._duration);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const decayFactor = Math.pow(1 - t, this._decay);
        data[i] = (Math.random() * 2 - 1) * decayFactor;
      }
    }
    return buffer;
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const convolver = ctx.createConvolver();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);

    convolver.buffer = this._generateImpulseResponse(ctx);

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input → convolver → wetGain → output
    inputGain.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(outputGain);

    this._setup = { inputGain, outputGain, convolver, dryGain, wetGain };
  }
}
