/**
 * @class AudioAnalyser
 * @memberof Exo
 */
export default class AudioAnalyser {

    /**
     * @constructor
     * @param {Exo.Sound|Exo.Music|Exo.AudioManager} target
     * @param {Object} [options]
     * @param {Number} [options.fftSize=2048]
     * @param {Number} [options.minDecibels=-100]
     * @param {Number} [options.maxDecibels=-30]
     * @param {Number} [options.smoothingTimeConstant=0.8]
     */
    constructor(target, { fftSize = 2048, minDecibels = -100, maxDecibels = -30, smoothingTimeConstant = 0.8 } = {}) {
        if (!target) {
            throw new Error('No analyser target was provided.');
        }

        if (!target.context) {
            throw new Error('Could not find AudioContext of the target.');
        }

        if (!target.analyserTarget) {
            throw new Error('Target has no valid AudioNode to analyse.');
        }

        /**
         * @private
         * @member {AudioContext}
         */
        this._context = target.context;

        /**
         * @private
         * @member {AnalyserNode}
         */
        this._analyser = this._context.createAnalyser();
        this._analyser.fftSize = fftSize;
        this._analyser.minDecibels = minDecibels;
        this._analyser.maxDecibels = maxDecibels;
        this._analyser.smoothingTimeConstant = smoothingTimeConstant;

        /**
         * @private
         * @member {AudioNode}
         */
        this._target = target.analyserTarget;
        this._target.connect(this._analyser);

        /**
         * @private
         * @member {Uint8Array} _timeDomainData
         */

        /**
         * @private
         * @member {Uint8Array} _frequencyData
         */

        /**
         * @private
         * @member {Float32Array} _preciseTimeDomainData
         */

        /**
         * @private
         * @member {Float32Array} _preciseFrequencyData
         */
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get timeDomainData() {
        const timeDomainData = this._timeDomainData || (this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount));

        this._analyser.getByteTimeDomainData(timeDomainData);

        return timeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get frequencyData() {
        const frequencyData = this._frequencyData || (this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount));

        this._analyser.getByteFrequencyData(frequencyData);

        return frequencyData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseTimeDomainData() {
        const preciseTimeDomainData = this._preciseTimeDomainData || (this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount));

        this._analyser.getFloatTimeDomainData(preciseTimeDomainData);

        return preciseTimeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseFrequencyData() {
        const preciseFrequencyData = this._preciseFrequencyData || (this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount));

        this._analyser.getFloatFrequencyData(preciseFrequencyData);

        return preciseFrequencyData;
    }

    /**
     * @public
     */
    destroy() {
        this._timeDomainData = null;
        this._frequencyData = null;
        this._preciseTimeDomainData = null;
        this._preciseFrequencyData = null;

        this._target.disconnect();
        this._target = null;

        this._analyser.disconnect();
        this._analyser = null;

        this._context = null;
    }
}
