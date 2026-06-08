import { getAudioContext, isAudioContextReady, onAudioContextReady } from '#audio/audio-context';
import { AudioFilter } from '#audio/AudioFilter';

/** Construction options for {@link ChorusFilter}. */
export interface ChorusFilterOptions {
  /** Base delay in ms. Typical 15-30ms. Default 25. */
  delayMs?: number;
  /** Modulation depth in ms (peak deviation from base). Default 5. */
  depthMs?: number;
  /** LFO rate in Hz. Typical 0.1-5Hz for chorus, 5-15Hz for vibrato. Default 1.5. */
  rateHz?: number;
  /** Dry/wet mix, 0..1. Default 0.5 (equal mix). */
  wet?: number;
}

interface ChorusFilterSetup {
  readonly inputGain: GainNode;
  readonly outputGain: GainNode;
  readonly dryGain: GainNode;
  readonly wetGain: GainNode;
  readonly delayNode: DelayNode;
  readonly lfoOscillator: OscillatorNode;
  readonly lfoGain: GainNode;
}

/**
 * Chorus effect using native WebAudio nodes (no worklet required).
 *
 * The signal splits into a dry path and a wet path. The wet path passes
 * through a DelayNode whose delay time is modulated by a sine-wave LFO,
 * producing the characteristic pitch-wobble / thickening of chorus.
 *
 * Node graph:
 * ```
 * inputGain ┬── dryGain ────────────────┐
 *           │                            ├── outputGain
 *           └── delayNode ── wetGain ────┘
 *
 * lfoOscillator ── lfoGain (depth) ── delayNode.delayTime
 * ```
 */
export class ChorusFilter extends AudioFilter {
  private _nodes: ChorusFilterSetup | null = null;
  private _delayMs: number;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setupNodes(ctx);
  };
  private _depthMs: number;
  private _rateHz: number;
  private _wet: number;

  public constructor(options: ChorusFilterOptions = {}) {
    super();
    this._delayMs = Math.max(0, options.delayMs ?? 25);
    this._depthMs = Math.max(0, options.depthMs ?? 5);
    this._rateHz = Math.max(0, options.rateHz ?? 1.5);
    this._wet = Math.max(0, Math.min(1, options.wet ?? 0.5));
    if (isAudioContextReady()) {
      this._setupNodes(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._nodes) throw new Error('ChorusFilter not yet initialized.');
    return this._nodes.inputGain;
  }

  public get outputNode(): AudioNode {
    if (!this._nodes) throw new Error('ChorusFilter not yet initialized.');
    return this._nodes.outputGain;
  }

  // -------------------------------------------------------------------------
  // Getters / setters
  // -------------------------------------------------------------------------

  /** Base delay time in milliseconds. Default 25. */
  public get delayMs(): number {
    return this._delayMs;
  }
  public set delayMs(value: number) {
    this._delayMs = Math.max(0, value);
    if (this._nodes) {
      this._nodes.delayNode.delayTime.setTargetAtTime(this._delayMs / 1000, this._nodes.delayNode.context.currentTime, 0.01);
    }
  }

  /** LFO modulation depth in milliseconds (peak deviation from base delay). Default 5. */
  public get depthMs(): number {
    return this._depthMs;
  }
  public set depthMs(value: number) {
    this._depthMs = Math.max(0, value);
    if (this._nodes) {
      this._nodes.lfoGain.gain.setTargetAtTime(this._depthMs / 1000, this._nodes.lfoGain.context.currentTime, 0.01);
    }
  }

  /** LFO oscillation rate in Hz. Typical chorus range is 0.1–5 Hz; 5–15 Hz produces a vibrato effect. Default 1.5. */
  public get rateHz(): number {
    return this._rateHz;
  }
  public set rateHz(value: number) {
    this._rateHz = Math.max(0, value);
    if (this._nodes) {
      this._nodes.lfoOscillator.frequency.setTargetAtTime(this._rateHz, this._nodes.inputGain.context.currentTime, 0.01);
    }
  }

  /** Wet (modulated) mix level, 0..1. The dry level is automatically `1 - wet`. Default 0.5. */
  public get wet(): number {
    return this._wet;
  }
  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._nodes) {
      const ctx = this._nodes.wetGain.context;
      this._nodes.wetGain.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01);
      this._nodes.dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    if (this._nodes) {
      this._nodes.lfoOscillator.stop();
      this._nodes.lfoOscillator.disconnect();
      this._nodes.lfoGain.disconnect();
      this._nodes.delayNode.disconnect();
      this._nodes.dryGain.disconnect();
      this._nodes.wetGain.disconnect();
      this._nodes.inputGain.disconnect();
      this._nodes.outputGain.disconnect();
      this._nodes = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _setupNodes(ctx: AudioContext): void {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    // maxDelayTime must be larger than base + peak depth, with a small buffer.
    const maxDelay = (this._delayMs + this._depthMs) / 1000 + 0.05;
    const delayNode = ctx.createDelay(maxDelay);
    const lfoGain = ctx.createGain();

    // Initial values
    inputGain.gain.setValueAtTime(1, ctx.currentTime);
    outputGain.gain.setValueAtTime(1, ctx.currentTime);
    dryGain.gain.setValueAtTime(1 - this._wet, ctx.currentTime);
    wetGain.gain.setValueAtTime(this._wet, ctx.currentTime);
    delayNode.delayTime.setValueAtTime(this._delayMs / 1000, ctx.currentTime);
    lfoGain.gain.setValueAtTime(this._depthMs / 1000, ctx.currentTime);

    // LFO
    const lfoOscillator = ctx.createOscillator();
    lfoOscillator.type = 'sine';
    lfoOscillator.frequency.value = this._rateHz;

    // Wiring
    // LFO → lfoGain → delayNode.delayTime (AudioParam)
    lfoOscillator.connect(lfoGain);
    lfoGain.connect(delayNode.delayTime as unknown as AudioNode);

    // Dry path: inputGain → dryGain → outputGain
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path: inputGain → delayNode → wetGain → outputGain
    inputGain.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(outputGain);

    lfoOscillator.start();

    this._nodes = { inputGain, outputGain, dryGain, wetGain, delayNode, lfoOscillator, lfoGain };
  }
}
