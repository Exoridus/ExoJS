import { IMedia } from "interfaces/IMedia";
import { audioContext, isAudioContextReady, onAudioContextReady } from "const/audio-context";

export interface AudioAnalyserOptions {
    fftSize: number;
    minDecibels: number;
    maxDecibels: number;
    smoothingTimeConstant: number;
}

export class AudioAnalyser {
    private readonly _media: IMedia;

    private readonly _fftSize: number;
    private readonly _minDecibels: number;
    private readonly _maxDecibels: number;
    private readonly _smoothingTimeConstant: number;
    private readonly _frequencyBinCount: number;

    private readonly _timeDomainData: Uint8Array;
    private readonly _frequencyData: Uint8Array;
    private readonly _preciseTimeDomainData: Float32Array;
    private readonly _preciseFrequencyData: Float32Array;

    private _analyser: AnalyserNode | null = null;
    private _audioContext: AudioContext | null = null;
    private _analyserTarget: AudioNode | null = null;

    constructor(media: IMedia, options: Partial<AudioAnalyserOptions> = {}) {
        const { fftSize,  minDecibels, maxDecibels, smoothingTimeConstant } = options;

        this._media = media;
        this._fftSize = fftSize ?? 2048;
        this._minDecibels = minDecibels ?? -100;
        this._maxDecibels = maxDecibels ?? -30;
        this._smoothingTimeConstant = smoothingTimeConstant ?? 0.8;
        this._frequencyBinCount = this._fftSize / 2;

        this._timeDomainData = new Uint8Array(this._frequencyBinCount);
        this._frequencyData = new Uint8Array(this._frequencyBinCount);
        this._preciseTimeDomainData = new Float32Array(this._frequencyBinCount);
        this._preciseFrequencyData = new Float32Array(this._frequencyBinCount);

        if (isAudioContextReady()) {
            this.setupWithAudioContext(audioContext!);
        } else {
            onAudioContextReady.once(this.setupWithAudioContext, this);
        }
    }

    public connect(): this {
        if (!this._analyser || this._analyserTarget !== null) {
            return this;
        }

        const analyserTarget = this._media.analyserTarget;

        if (!analyserTarget) {
            throw new Error('No AudioNode on property analyserTarget.');
        }

        this._analyserTarget = analyserTarget;
        analyserTarget.connect(this._analyser);

        return this;
    }

    public get timeDomainData(): Uint8Array {
        if (this._analyser) {
            this.connect();
            this._analyser!.getByteTimeDomainData(this._timeDomainData);
        }

        return this._timeDomainData;
    }

    public get frequencyData(): Uint8Array {
        if (this._analyser) {
            this.connect();
            this._analyser.getByteFrequencyData(this._frequencyData);
        }

        return this._frequencyData;
    }

    public get preciseTimeDomainData(): Float32Array {
        if (this._analyser) {
            this.connect();
            this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);
        }

        return this._preciseTimeDomainData;
    }

    public get preciseFrequencyData(): Float32Array {
        if (this._analyser) {
            this.connect();
            this._analyser.getFloatFrequencyData(this._preciseFrequencyData);
        }

        return this._preciseFrequencyData;
    }

    public destroy() {
        onAudioContextReady.remove(this.setupWithAudioContext, this);

        this._analyserTarget?.disconnect();
        this._analyser?.disconnect();
    }

    private setupWithAudioContext(audioContext: AudioContext) {
        this._audioContext = audioContext;
        this._analyser = audioContext.createAnalyser();
        this._analyser.fftSize = this._fftSize;
        this._analyser.minDecibels = this._minDecibels;
        this._analyser.maxDecibels = this._maxDecibels;
        this._analyser.smoothingTimeConstant = this._smoothingTimeConstant;
    }
}
