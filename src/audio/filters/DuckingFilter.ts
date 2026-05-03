import { onAudioContextReady, isAudioContextReady, getAudioContext } from '../audio-context';
import { AudioFilter } from '../AudioFilter';
import type { AudioBus } from '../AudioBus';

export interface DuckingFilterOptions {
    sidechain: AudioBus;
    threshold?: number;
    ratio?: number;
    attackMs?: number;
    releaseMs?: number;
}

interface DuckingFilterSetup {
    readonly gainNode: GainNode;
    readonly analyser: AnalyserNode;
    readonly timeDomainBuffer: Uint8Array<ArrayBuffer>;
}

export class DuckingFilter extends AudioFilter {
    private _setup: DuckingFilterSetup | null = null;
    private _sidechain: AudioBus;
    private _threshold: number;
    private _ratio: number;
    private _attackMs: number;
    private _releaseMs: number;
    private _intervalId: ReturnType<typeof setInterval> | null = null;

    public constructor(options: DuckingFilterOptions) {
        super();
        this._sidechain = options.sidechain;
        this._threshold = options.threshold ?? -20;
        this._ratio = Math.max(1, options.ratio ?? 4);
        this._attackMs = Math.max(1, options.attackMs ?? 30);
        this._releaseMs = Math.max(1, options.releaseMs ?? 300);
        if (isAudioContextReady()) {
            this._setupNodes(getAudioContext());
        } else {
            onAudioContextReady.once(this._setupNodes, this);
        }
    }

    public get inputNode(): AudioNode {
        if (!this._setup) throw new Error('DuckingFilter not yet initialized.');
        return this._setup.gainNode;
    }

    public get outputNode(): AudioNode {
        if (!this._setup) throw new Error('DuckingFilter not yet initialized.');
        return this._setup.gainNode;
    }

    public get threshold(): number {
        return this._threshold;
    }

    public set threshold(value: number) {
        this._threshold = value;
    }

    public get ratio(): number {
        return this._ratio;
    }

    public set ratio(value: number) {
        this._ratio = Math.max(1, value);
    }

    public get attackMs(): number {
        return this._attackMs;
    }

    public set attackMs(value: number) {
        this._attackMs = Math.max(1, value);
    }

    public get releaseMs(): number {
        return this._releaseMs;
    }

    public set releaseMs(value: number) {
        this._releaseMs = Math.max(1, value);
    }

    public override destroy(): void {
        onAudioContextReady.clearByContext(this);
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        if (this._setup) {
            this._setup.analyser.disconnect();
            this._setup.gainNode.disconnect();
            this._setup = null;
        }
    }

    private _setupNodes(ctx: AudioContext): void {
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1, ctx.currentTime);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;

        const timeDomainBuffer = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;

        this._setup = { gainNode, analyser, timeDomainBuffer };

        // Connect the analyser as a parallel tap on the sidechain's input.
        // This does NOT affect the sidechain's normal audio path.
        this._sidechain.onceSetup(() => {
            const sidechainInput = this._sidechain._getInputNode();
            if (sidechainInput && this._setup) {
                sidechainInput.connect(this._setup.analyser);
            }
        });

        // Start per-frame envelope follower (~60 Hz).
        this._intervalId = setInterval(() => { this._tick(); }, 1000 / 60);
    }

    private _tick(): void {
        if (!this._setup) return;

        const { analyser, timeDomainBuffer, gainNode } = this._setup;
        analyser.getByteTimeDomainData(timeDomainBuffer);

        // Compute RMS of the time-domain signal.
        let sumSq = 0;
        for (let i = 0; i < timeDomainBuffer.length; i++) {
            // Byte data is in range 0..255 centered at 128.
            const sample = (timeDomainBuffer[i] - 128) / 128;
            sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / timeDomainBuffer.length);

        // Convert to dB (guard against log(0)).
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

        const ctx = gainNode.context;
        if (rmsDb > this._threshold) {
            // Sidechain is loud — duck.
            const targetGain = 1 / this._ratio;
            gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, this._attackMs / 1000);
        } else {
            // Sidechain is quiet — restore.
            gainNode.gain.setTargetAtTime(1, ctx.currentTime, this._releaseMs / 1000);
        }
    }
}
