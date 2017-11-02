import support from '../support';

/**
 * @class AudioAnalyser
 */
export default class AudioAnalyser {

    /**
     * @constructor
     * @param {Media|Sound|Music|Video|MediaManager} media
     * @param {Object} [options={}]
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
        this._analyser = null;

        /**
         * @private
         * @member {?AudioNode}
         */
        this._analyserTarget = null;

        /**
         * @private
         * @member {Media|Sound|Music|Video|MediaManager}
         */
        this._media = media;

        /**
         * @private
         * @member {Number}
         */
        this._fftSize = fftSize;

        /**
         * @private
         * @member {Number}
         */
        this._minDecibels = minDecibels;

        /**
         * @private
         * @member {Number}
         */
        this._maxDecibels = maxDecibels;

        /**
         * @private
         * @member {Number}
         */
        this._smoothingTimeConstant = smoothingTimeConstant;

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
        if (support.webAudio && !this._analyser) {
            const audioContext = this._media.audioContext,
                analyserTarget = this._media.analyserTarget;

            if (!audioContext) {
                throw new Error('Could not get AudioContext of the target.');
            }

            if (!analyserTarget) {
                throw new Error('No AudioNode on property analyserTarget.');
            }

            this._analyser = audioContext.createAnalyser();
            this._analyser.fftSize = this._fftSize;
            this._analyser.minDecibels = this._minDecibels;
            this._analyser.maxDecibels = this._maxDecibels;
            this._analyser.smoothingTimeConstant = this._smoothingTimeConstant;

            this._analyserTarget = analyserTarget;
            this._analyserTarget.connect(this._analyser);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {AudioAnalyser}
     */
    disconnect() {
        if (this._analyser) {
            this._analyser.disconnect();
            this._analyser = null;

            this._analyserTarget.disconnect();
            this._analyserTarget = null;
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
        this.disconnect();

        this._media = null;
        this._fftSize = null;
        this._minDecibels = null;
        this._maxDecibels = null;
        this._smoothingTimeConstant = null;
        this._timeDomainData = null;
        this._frequencyData = null;
        this._preciseTimeDomainData = null;
        this._preciseFrequencyData = null;
    }
}
