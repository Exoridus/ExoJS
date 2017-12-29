import support from '../support';
import { AUDIO_CONTEXT } from '../const/core';

/**
 * @class AudioAnalyser
 */
export default class AudioAnalyser {

    /**
     * @constructor
     * @param {Sound|Music|Video} media
     * @param {Object} [options]
     * @param {Number} [options.fftSize=2048]
     * @param {Number} [options.minDecibels=-100]
     * @param {Number} [options.maxDecibels=-30]
     * @param {Number} [options.smoothingTimeConstant=0.8]
     */
    constructor(media, {
        fftSize = 2048,
        minDecibels = -100,
        maxDecibels = -30,
        smoothingTimeConstant = 0.8,
    } = {}) {
        if (!support.webAudio) {
            throw new Error('Web Audio API should be enabled when using the audio analyzer.');
        }

        /**
         * @private
         * @member {?AnalyserNode}
         */
        this._analyser = AUDIO_CONTEXT.createAnalyser();
        this._analyser.fftSize = fftSize;
        this._analyser.minDecibels = minDecibels;
        this._analyser.maxDecibels = maxDecibels;
        this._analyser.smoothingTimeConstant = smoothingTimeConstant;

        /**
         * @private
         * @member {?AudioNode}
         */
        this._analyserTarget = null;

        /**
         * @private
         * @member {Sound|Music|Video}
         */
        this._media = media;

        /**
         * @private
         * @member {?Uint8Array}
         */
        this._timeDomainData = null;

        /**
         * @private
         * @member {?Uint8Array}
         */
        this._frequencyData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        this._preciseTimeDomainData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        this._preciseFrequencyData = null;
    }

    /**
     * @public
     * @chainable
     * @returns {AudioAnalyser}
     */
    connect() {
        if (support.webAudio && !this._analyserTarget) {
            if (!this._media.analyserTarget) {
                throw new Error('No AudioNode on property analyserTarget.');
            }

            this._analyserTarget = this._media.analyserTarget;
            this._analyserTarget.connect(this._analyser);
        }

        return this;
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get timeDomainData() {
        this.connect();

        if (!this._timeDomainData) {
            this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);
        }

        this._analyser.getByteTimeDomainData(this._timeDomainData);

        return this._timeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get frequencyData() {
        this.connect();

        if (!this._frequencyData) {
            this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
        }

        this._analyser.getByteFrequencyData(this._frequencyData);

        return this._frequencyData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseTimeDomainData() {
        this.connect();

        if (!this._preciseTimeDomainData) {
            this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);
        }

        this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);

        return this._preciseTimeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseFrequencyData() {
        this.connect();

        if (!this._preciseFrequencyData) {
            this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
        }

        this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

        return this._preciseFrequencyData;
    }

    /**
     * @public
     */
    destroy() {
        if (this._analyserTarget) {
            this._analyserTarget.disconnect();
            this._analyserTarget = null;
        }

        this._analyser.disconnect();
        this._analyser = null;

        this._media = null;
        this._timeDomainData = null;
        this._frequencyData = null;
        this._preciseTimeDomainData = null;
        this._preciseFrequencyData = null;
    }
}
