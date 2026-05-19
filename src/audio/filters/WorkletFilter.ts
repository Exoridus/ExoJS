import { getAudioContext, isAudioContextReady, onAudioContextReady } from '../audio-context';
import { AudioFilter } from '../AudioFilter';
import { registerWorkletProcessor } from '../worklet/registerWorklet';

/**
 * Base class for filters implemented as AudioWorkletProcessors. Subclasses
 * declare the worklet's name, source code, and node options; this class
 * handles the async lifecycle.
 *
 * Stable input/output nodes (GainNodes) are created immediately on setup.
 * While the worklet loads asynchronously, audio passes through directly
 * (effectively bypassing the filter for ~10-50ms during initial load).
 * Once the worklet loads, it's inserted into the chain and audio routes
 * through it.
 *
 * Subclasses can override `_onWorkletReady` to perform additional wiring
 * (e.g., sidechain inputs).
 * @advanced
 */
export abstract class WorkletFilter extends AudioFilter {
  protected _inputGain: GainNode | null = null;
  protected _outputGain: GainNode | null = null;
  protected _workletNode: AudioWorkletNode | null = null;
  protected _ready: Promise<void> | null = null;

  /** The processor name registered via `registerProcessor()` in the worklet source. */
  protected abstract get _workletName(): string;
  /** The full worklet source code as a JavaScript string. */
  protected abstract get _workletSource(): string;
  /** AudioWorkletNode constructor options. Default: 1 input, 1 output. */
  protected get _workletOptions(): AudioWorkletNodeOptions {
    return { numberOfInputs: 1, numberOfOutputs: 1 };
  }

  public constructor() {
    super();
    if (isAudioContextReady()) {
      this._setup(getAudioContext());
    } else {
      onAudioContextReady.once(this._setup, this);
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

  /**
   * Resolves once the underlying worklet is loaded and inserted into the
   * audio chain. Use this if you need to wait before applying parameters
   * that depend on the worklet node.
   */
  public override get ready(): Promise<void> {
    return this._ready ?? Promise.resolve();
  }

  /** Disconnects all nodes, cancels any pending worklet load, and releases resources. */
  public override destroy(): void {
    onAudioContextReady.clearByContext(this);
    this._workletNode?.disconnect();
    this._inputGain?.disconnect();
    this._outputGain?.disconnect();
    this._workletNode = null;
    this._inputGain = null;
    this._outputGain = null;
    this._ready = null;
  }

  /**
   * Subclass hook — called once when the worklet has loaded and the
   * AudioWorkletNode is inserted into the chain. Use this for additional
   * wiring (e.g., connecting a sidechain input).
   */
  protected _onWorkletReady?(audioContext: AudioContext): void;

  /**
   * Ramps an `AudioParam` on the underlying `AudioWorkletNode` to `value`
   * using a short exponential ramp. No-ops if the worklet is not yet loaded.
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
    // Create stable input/output gains immediately (bus can wire them now).
    const inputGain = audioContext.createGain();
    const outputGain = audioContext.createGain();
    // Bypass: input → output until worklet loads.
    inputGain.connect(outputGain);

    this._inputGain = inputGain;
    this._outputGain = outputGain;

    // Async-load the worklet, then re-route through it.
    this._ready = registerWorkletProcessor(audioContext, this._workletName, this._workletSource).then(() => {
      if (!this._inputGain || !this._outputGain) return; // destroyed during load

      const node = new AudioWorkletNode(audioContext, this._workletName, this._workletOptions);
      this._workletNode = node;

      // Re-route: input → worklet → output
      this._inputGain.disconnect();
      this._inputGain.connect(node);
      node.connect(this._outputGain);

      this._onWorkletReady?.(audioContext);
    });
  }
}
