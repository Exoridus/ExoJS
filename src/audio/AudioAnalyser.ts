import { GlobalAudioContext } from '../const/core';
import { supportsWebAudio } from "../support";
import Sound from "./Sound";
import Music from "./Music";

export interface AudioAnalyserOptions {
    fftSize?: number;
    minDecibels?: number;
    maxDecibels?: number;
    smoothingTimeConstant?: number;
}

export default class AudioAnalyser {

    private readonly _analyser: AnalyserNode;
    private readonly _media: Sound | Music | Video;
    private readonly _timeDomainData: Uint8Array;
    private readonly _frequencyData: Uint8Array;
    private readonly _preciseTimeDomainData: Float32Array;
    private readonly _preciseFrequencyData: Float32Array;
    private _analyserTarget: AudioNode | null = null;

    constructor(media: Sound | Music | Video, options: AudioAnalyserOptions = {}) {
        if (!supportsWebAudio) {
            throw new Error('Web Audio API should be enabled when using the audio analyzer.');
        }

        const { fftSize,  minDecibels, maxDecibels, smoothingTimeConstant } = options;

        this._analyser = GlobalAudioContext.createAnalyser();
        this._analyser.fftSize = fftSize ?? 2048;
        this._analyser.minDecibels = minDecibels ?? -100;
        this._analyser.maxDecibels = maxDecibels ?? -30;
        this._analyser.smoothingTimeConstant = smoothingTimeConstant ?? 0.8;

        this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);
        this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
        this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);
        this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
    }

    connect(): this {
        if (supportsWebAudio && this._analyserTarget === null) {
            const analyserTarget = this._media.analyserTarget;

            if (!analyserTarget) {
                throw new Error('No AudioNode on property analyserTarget.');
            }

            this._analyserTarget = analyserTarget;
            analyserTarget.connect(this._analyser);
        }

        return this;
    }

    get timeDomainData(): Uint8Array {
        this.connect();

        this._analyser.getByteTimeDomainData(this._timeDomainData);

        return this._timeDomainData;
    }

    get frequencyData(): Uint8Array {
        this.connect();

        this._analyser.getByteFrequencyData(this._frequencyData);

        return this._frequencyData;
    }

    get preciseTimeDomainData(): Float32Array {
        this.connect();

        this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);

        return this._preciseTimeDomainData;
    }

    get preciseFrequencyData(): Float32Array {
        this.connect();

        this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

        return this._preciseFrequencyData;
    }

    destroy() {
        this._analyserTarget?.disconnect();
        this._analyser.disconnect();
    }
}
