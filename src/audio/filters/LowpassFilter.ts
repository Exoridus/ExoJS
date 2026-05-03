import { onAudioContextReady, isAudioContextReady, getAudioContext } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

export interface LowpassFilterOptions {
    frequency?: number;
    resonance?: number;
}

export class LowpassFilter extends AudioFilter {
    private _node: BiquadFilterNode | null = null;
    private _frequency: number;
    private _resonance: number;

    public constructor(options: LowpassFilterOptions = {}) {
        super();
        this._frequency = options.frequency ?? 1000;
        this._resonance = options.resonance ?? 1;
        if (isAudioContextReady()) {
            this._setup(getAudioContext());
        } else {
            onAudioContextReady.once(this._setup, this);
        }
    }

    public get inputNode(): AudioNode {
        if (!this._node) throw new Error('LowpassFilter not yet initialized.');
        return this._node;
    }

    public get outputNode(): AudioNode {
        if (!this._node) throw new Error('LowpassFilter not yet initialized.');
        return this._node;
    }

    public get frequency(): number {
        return this._frequency;
    }

    public set frequency(value: number) {
        this._frequency = Math.max(20, Math.min(20000, value));
        if (this._node) {
            this._node.frequency.setTargetAtTime(this._frequency, this._node.context.currentTime, 0.01);
        }
    }

    public get resonance(): number {
        return this._resonance;
    }

    public set resonance(value: number) {
        this._resonance = Math.max(0.0001, value);
        if (this._node) {
            this._node.Q.setTargetAtTime(this._resonance, this._node.context.currentTime, 0.01);
        }
    }

    public override destroy(): void {
        onAudioContextReady.clearByContext(this);
        this._node?.disconnect();
        this._node = null;
    }

    private _setup(ctx: AudioContext): void {
        const node = ctx.createBiquadFilter();
        node.type = 'lowpass';
        node.frequency.setValueAtTime(this._frequency, ctx.currentTime);
        node.Q.setValueAtTime(this._resonance, ctx.currentTime);
        this._node = node;
    }
}
