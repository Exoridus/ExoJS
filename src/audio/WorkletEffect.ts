import { getAudioContext, isAudioContextReady, onAudioContextReady } from '#audio/audio-context';
import { AudioEffect } from '#audio/AudioEffect';
import { registerAudioWorkletProcessor } from '#audio/worklet/registerWorklet';

/**
 * Base class for filters implemented as AudioWorkletProcessors. Subclasses
 * declare the worklet's name, source code, and node options; this class owns
 * the async lifecycle AND the dry/wet gain staging.
 *
 * Stable input/output nodes are created immediately. The worklet emits a pure
 * wet signal; the base mixes it against the dry signal via `_dryGain`/`_wetGain`
 * (`dryGain = 1 - wet`, `wetGain = wet * _wetMakeupGain`). An optional
 * `_dryDelay` time-aligns the dry path with the worklet's algorithmic latency.
 * While the worklet loads, the wet path is silent and dry passes at unity, so
 * the effect is a clean passthrough (no volume dip) until it is ready.
 * @advanced
 */
export abstract class WorkletEffect extends AudioEffect {
  protected _inputGain: GainNode | null = null;
  protected _outputGain: GainNode | null = null;
  protected _dryGain: GainNode | null = null;
  protected _wetGain: GainNode | null = null;
  protected _dryDelay: DelayNode | null = null;
  protected _workletNode: AudioWorkletNode | null = null;
  protected _ready: Promise<void> | null = null;
  protected _wet = 1;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._setup(ctx);
  };

  /** The processor name registered via `registerProcessor()` in the worklet source. */
  protected abstract get _workletName(): string;
  /** The full worklet source code as a JavaScript string. */
  protected abstract get _workletSource(): string;
  /** AudioWorkletNode constructor options. Default: 1 input, 1 output. */
  protected get _workletOptions(): AudioWorkletNodeOptions {
    return { numberOfInputs: 1, numberOfOutputs: 1 };
  }

  /**
   * Dry-path delay in seconds, time-aligning the dry signal with the worklet's
   * algorithmic latency so intermediate `wet` values do not comb-filter.
   * Default 0 (no delay). Override in subclasses with buffering latency.
   */
  protected get _dryLatencySeconds(): number {
    return 0;
  }

  /** Static makeup multiplier folded into the wet path (`wetGain = wet * this`). Default 1. */
  protected get _wetMakeupGain(): number {
    return 1;
  }

  /**
   * The audio context's sample rate in Hz, or 48000 if the context is not yet
   * available. Populated as soon as the audio context is ready (i.e. once
   * `_setup` runs). Safe to read from `_dryLatencySeconds`.
   */
  protected get _sampleRate(): number {
    return this._outputGain?.context.sampleRate ?? 48000;
  }

  public constructor() {
    super();
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public get inputNode(): AudioNode {
    if (!this._inputGain) {
      throw new Error(`${this.constructor.name}: input node accessed before audio context is ready.`);
    }
    return this._inputGain;
  }

  public get outputNode(): AudioNode {
    if (!this._outputGain) {
      throw new Error(`${this.constructor.name}: output node accessed before audio context is ready.`);
    }
    return this._outputGain;
  }

  /** Wet (processed) mix level, 0..1. The dry level is automatically `1 - wet`. Ramped smoothly. */
  public get wet(): number {
    return this._wet;
  }

  public set wet(value: number) {
    this._wet = Math.max(0, Math.min(1, value));
    if (this._dryGain && this._wetGain) {
      const ctx = this._wetGain.context;
      this._dryGain.gain.setTargetAtTime(1 - this._wet, ctx.currentTime, 0.01);
      this._wetGain.gain.setTargetAtTime(this._wet * this._wetMakeupGain, ctx.currentTime, 0.01);
    }
  }

  /** Resolves once the worklet is loaded and inserted into the wet path. */
  public override get ready(): Promise<void> {
    return this._ready ?? Promise.resolve();
  }

  /** Disconnects all nodes, cancels any pending worklet load, and releases resources. */
  public override destroy(): void {
    onAudioContextReady.remove(this._onAudioContextReady);
    this._workletNode?.disconnect();
    this._inputGain?.disconnect();
    this._outputGain?.disconnect();
    this._dryGain?.disconnect();
    this._wetGain?.disconnect();
    this._dryDelay?.disconnect();
    this._workletNode = null;
    this._inputGain = null;
    this._outputGain = null;
    this._dryGain = null;
    this._wetGain = null;
    this._dryDelay = null;
    this._ready = null;
  }

  /**
   * Subclass hook — called once the worklet is loaded and inserted into the
   * wet path. Use for additional wiring (e.g. a sidechain input).
   */
  protected _onWorkletReady?(audioContext: AudioContext): void;

  /**
   * Ramps an `AudioParam` on the underlying `AudioWorkletNode` to `value` using
   * a short exponential ramp. No-ops if the worklet is not yet loaded.
   * @internal
   */
  protected _setAudioParam(name: string, value: number): void {
    if (!this._workletNode) return;
    const audioParam = this._workletNode.parameters.get(name);
    if (audioParam) {
      audioParam.setTargetAtTime(value, this._workletNode.context.currentTime, 0.01);
    }
  }

  private _setup(audioContext: AudioContext): void {
    const inputGain = audioContext.createGain();
    const outputGain = audioContext.createGain();
    const dryGain = audioContext.createGain();
    const wetGain = audioContext.createGain();

    // Assign gain references immediately so inputNode/outputNode are accessible
    // and _sampleRate (which reads this._outputGain.context.sampleRate) returns
    // the real context rate for subclass use in _dryLatencySeconds.
    this._inputGain = inputGain;
    this._outputGain = outputGain;

    // Dry path: input → dryGain → output. A time-alignment DelayNode is
    // inserted in the worklet-ready callback below once _dryLatencySeconds is
    // safe to read. The addModule Promise always settles asynchronously, so the
    // subclass constructor is fully done by then (post-super() fields such as
    // PitchShiftEffect._grainSize are guaranteed initialized).
    inputGain.connect(dryGain);
    dryGain.connect(outputGain);

    // Wet path output stage exists immediately but is silent until the worklet
    // loads. Dry passes at unity meanwhile → clean passthrough, no volume dip.
    dryGain.gain.setValueAtTime(1, audioContext.currentTime);
    wetGain.gain.setValueAtTime(0, audioContext.currentTime);
    wetGain.connect(outputGain);

    this._dryGain = dryGain;
    this._wetGain = wetGain;

    this._ready = registerAudioWorkletProcessor(audioContext, this._workletName, this._workletSource).then(() => {
      if (!this._inputGain || !this._dryGain || !this._wetGain) return; // destroyed during load

      // Read _dryLatencySeconds here, not in _setup(), because the addModule
      // Promise always resolves asynchronously — by this point the subclass
      // constructor has fully run and any post-super() fields are valid.
      const dryLatency = this._dryLatencySeconds;
      if (dryLatency > 0) {
        const dryDelay = audioContext.createDelay(Math.max(1, dryLatency * 2));
        dryDelay.delayTime.setValueAtTime(dryLatency, audioContext.currentTime);
        this._dryDelay = dryDelay;
        // Re-route dry path to insert the delay: inputGain → dryDelay → dryGain.
        // Use the destination-argument form of disconnect so only this edge is
        // moved; the inputGain → worklet connection (added below) is unaffected.
        this._inputGain.disconnect(this._dryGain);
        this._inputGain.connect(dryDelay);
        dryDelay.connect(this._dryGain);
      }

      const node = new AudioWorkletNode(audioContext, this._workletName, this._workletOptions);
      this._workletNode = node;

      // Wet path: input → worklet → wetGain.
      this._inputGain.connect(node);
      node.connect(this._wetGain);

      // Apply the configured mix now that the wet path carries signal.
      this.wet = this._wet;

      this._onWorkletReady?.(audioContext);
    });
  }
}
