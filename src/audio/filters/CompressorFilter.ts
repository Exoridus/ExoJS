import { onAudioContextReady, isAudioContextReady, getAudioContext } from '../audio-context';
import { AudioFilter } from '../AudioFilter';

export interface CompressorFilterOptions {
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
}

export class CompressorFilter extends AudioFilter {
    private _node: DynamicsCompressorNode | null = null;
    private _threshold: number;
    private _knee: number;
    private _ratio: number;
    private _attack: number;
    private _release: number;

    public constructor(options: CompressorFilterOptions = {}) {
        super();
        this._threshold = Math.max(-100, Math.min(0, options.threshold ?? -24));
        this._knee = Math.max(0, Math.min(40, options.knee ?? 30));
        this._ratio = Math.max(1, Math.min(20, options.ratio ?? 12));
        this._attack = Math.max(0, Math.min(1, options.attack ?? 0.003));
        this._release = Math.max(0, Math.min(1, options.release ?? 0.25));
        if (isAudioContextReady()) {
            this._setup(getAudioContext());
        } else {
            onAudioContextReady.once(this._setup, this);
        }
    }

    public get inputNode(): AudioNode {
        if (!this._node) throw new Error('CompressorFilter not yet initialized.');
        return this._node;
    }

    public get outputNode(): AudioNode {
        if (!this._node) throw new Error('CompressorFilter not yet initialized.');
        return this._node;
    }

    public get threshold(): number {
        return this._threshold;
    }

    public set threshold(value: number) {
        this._threshold = Math.max(-100, Math.min(0, value));
        if (this._node) {
            this._node.threshold.setTargetAtTime(this._threshold, this._node.context.currentTime, 0.01);
        }
    }

    public get knee(): number {
        return this._knee;
    }

    public set knee(value: number) {
        this._knee = Math.max(0, Math.min(40, value));
        if (this._node) {
            this._node.knee.setTargetAtTime(this._knee, this._node.context.currentTime, 0.01);
        }
    }

    public get ratio(): number {
        return this._ratio;
    }

    public set ratio(value: number) {
        this._ratio = Math.max(1, Math.min(20, value));
        if (this._node) {
            this._node.ratio.setTargetAtTime(this._ratio, this._node.context.currentTime, 0.01);
        }
    }

    public get attack(): number {
        return this._attack;
    }

    public set attack(value: number) {
        this._attack = Math.max(0, Math.min(1, value));
        if (this._node) {
            this._node.attack.setTargetAtTime(this._attack, this._node.context.currentTime, 0.01);
        }
    }

    public get release(): number {
        return this._release;
    }

    public set release(value: number) {
        this._release = Math.max(0, Math.min(1, value));
        if (this._node) {
            this._node.release.setTargetAtTime(this._release, this._node.context.currentTime, 0.01);
        }
    }

    public override destroy(): void {
        onAudioContextReady.clearByContext(this);
        this._node?.disconnect();
        this._node = null;
    }

    private _setup(ctx: AudioContext): void {
        const node = ctx.createDynamicsCompressor();
        node.threshold.setValueAtTime(this._threshold, ctx.currentTime);
        node.knee.setValueAtTime(this._knee, ctx.currentTime);
        node.ratio.setValueAtTime(this._ratio, ctx.currentTime);
        node.attack.setValueAtTime(this._attack, ctx.currentTime);
        node.release.setValueAtTime(this._release, ctx.currentTime);
        this._node = node;
    }
}
