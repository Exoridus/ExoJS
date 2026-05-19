import { getAudioContext, isAudioContextReady, onAudioContextReady } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

/** Construction options for {@link DelayFilter}. */
export interface DelayFilterOptions {
  delaySeconds?: number;
  feedback?: number;
  wet?: number;
}

interface DelayFilterSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly delayNode: DelayNode;
  readonly feedbackGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
}

/**
 * Echo/delay effect using a Web Audio `DelayNode` with a feedback loop and
 * dry/wet mix. The feedback path feeds the delayed signal back into itself,
 * producing repeating echoes that decay naturally. Setting `feedback` near
 * its maximum of 0.95 produces a long, prominent tail; lower values create
 * a single slap-back echo.
 */
export class DelayFilter extends AudioFilter {
  private _setup: DelayFilterSetup | null = null;
  private _delaySeconds: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };
  private _feedback: number;
  private _wet: number;

  public constructor(options: DelayFilterOptions = {}) {
    super();
    this._delaySeconds = Math.max(0, Math.min(5, options.delaySeconds ?? 0.3));
    this._feedback = Math.max(0, Math.min(0.95, options.feedback ?? 0.4));
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.5));
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._setup) throw new Error('DelayFilter not yet initialized.');
    return this._setup.inputGain;
  }

  public get outputNode(): AudioNode {
    if (!this._setup) throw new Error('DelayFilter not yet initialized.');
    return this._setup.outputGain;
  }

  /** Delay time in seconds. Range 0..5, default 0.3. */
  public get delaySeconds(): number {
    return this._delaySeconds;
  }

  public set delaySeconds(value: number) {
    this._delaySeconds = Math.max(0, Math.min(5, value));
    if (this._setup) {
      this._setup.delayNode.delayTime.setTargetAtTime(this._delaySeconds, this._setup.delayNode.context.currentTime, 0.01);
    }
  }

  /** Fraction of the delayed signal fed back into the delay input. Range 0..0.95, default 0.4. */
  public get feedback(): number {
    return this._feedback;
  }

  public set feedback(value: number) {
    this._feedback = Math.max(0, Math.min(0.95, value));
    if (this._setup) {
      this._setup.feedbackGain.gain.setTargetAtTime(this._feedback, this._setup.feedbackGain.context.currentTime, 0.01);
    }
  }

  /** Wet (delayed) mix level, 0..1. The dry level is automatically `1 - wet`. Default 0.5. */
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
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._setup) {
      this._setup.inputGain.disconnect();
      this._setup.delayNode.disconnect();
      this._setup.feedbackGain.disconnect();
      this._setup.dryGain.disconnect();
      this._setup.wetGain.disconnect();
      this._setup.outputGain.disconnect();
      this._setup = null;
    }
  }

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const delayNode = ctx.createDelay(5);
    const feedbackGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    delayNode.delayTime.setValueAtTime(this._delaySeconds, ctx.currentTime);
    feedbackGain.gain.setValueAtTime(this._feedback, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);

    // Dry path: input → dryGain → output
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: input → delay → wetGain → output
    inputGain.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(outputGain);

    // Feedback loop: delay → feedbackGain → delay
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    this._setup = { inputGain, outputGain, delayNode, feedbackGain, dryGain, wetGain };
  }
}
