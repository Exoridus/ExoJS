/**
 * @class AudioAnalyser
 */
export default class AudioAnalyser {

    /**
     * @constructor
     * @param {Sound|Music|AudioManager} target
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

        /**
         * @private
         * @member {Sound|Music|AudioManager}
         */
        this._target = target;

        /**
         * @private
         * @member {Object}
         */
        this._options = {
            fftSize,
            minDecibels,
            maxDecibels,
            smoothingTimeConstant,
        };
    }

    ensureContext() {
        if (this._context) {
            return;
        }

        if (!this._target.context) {
            throw new Error('Failed to provide an AudioContext from the target.');
        }

        if (!this._target.analyserTarget) {
            throw new Error('Target has no valid AudioNode to analyse.');
        }

        /**
         * @private
         * @member {AudioContext}
         */
        this._context = this._target.context;

        /**
         * @private
         * @member {AnalyserNode}
         */
        this._analyser = Object.assign(this._context.createAnalyser(), this._options);

        /**
         * @private
         * @member {AudioNode}
         */
        this._targetNode = this._target.analyserTarget;
        this._targetNode.connect(this._analyser);

        /**
         * @private
         * @member {Uint8Array} _timeDomainData
         */
        this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Uint8Array} _frequencyData
         */
        this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Float32Array} _preciseTimeDomainData
         */
        this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Float32Array} _preciseFrequencyData
         */
        this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get timeDomainData() {
        this.ensureContext();

        this._analyser.getByteTimeDomainData(this._timeDomainData);

        return this._timeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Uint8Array}
     */
    get frequencyData() {
        this.ensureContext();

        this._analyser.getByteFrequencyData(this._frequencyData);

        return this._frequencyData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseTimeDomainData() {
        this.ensureContext();

        this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);

        return this._preciseTimeDomainData;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get preciseFrequencyData() {
        this.ensureContext();

        this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

        return this._preciseFrequencyData;
    }

    /**
     * @public
     */
    destroy() {
        this._target = null;
        this._options = null;

        if (this._context) {
            this._context = null;

            this._targetNode.disconnect(this._analyser);
            this._targetNode = null;

            this._analyser.disconnect();
            this._analyser = null;

            this._timeDomainData = null;
            this._frequencyData = null;
            this._preciseTimeDomainData = null;
            this._preciseFrequencyData = null;
        }
    }
}
