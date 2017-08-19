/**
 * @class AudioAnalyser
 * @memberof Exo
 */
export default class AudioAnalyser {

    /**
     * @constructor
     * @param {Exo.Sound|Exo.Music|Exo.AudioManager} target
     */
    constructor(target) {

        /**
         * @private
         * @member {AudioContext}
         */
        this._context = target.context;

        if (!this._context) {
            throw new Error('Target has no AudioContext to work with.');
        }

        /**
         * @private
         * @member {AudioNode}
         */
        this._targetNode = target.analyserTarget;

        if (!this._targetNode) {
            throw new Error('Target has no valid AudioNode to analyse.');
        }

        /**
         * @private
         * @member {AnalyserNode}
         */
        this._analyser = this._context.createAnalyser();
        this._targetNode.connect(this._analyser);

        /**
         * @private
         * @member {Uint8Array}
         */
        this._timeDomainData = new Uint8Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Uint8Array|null}
         */
        this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Float32Array|null}
         */
        this._preciseTimeDomainData = new Float32Array(this._analyser.frequencyBinCount);

        /**
         * @private
         * @member {Float32Array|null}
         */
        this._preciseFrequencyData = new Float32Array(this._analyser.frequencyBinCount);
    }

    /**
     * @public
     * @returns {Uint8Array}
     */
    getTimeDomainData() {
        this._analyser.getByteTimeDomainData(this._timeDomainData);

        return this._timeDomainData;
    }

    /**
     * @public
     * @returns {Uint8Array}
     */
    getFrequencyData() {
        this._analyser.getByteFrequencyData(this._frequencyData);

        return this._frequencyData;
    }

    /**
     * @public
     * @returns {Float32Array}
     */
    getPreciseTimeDomainData() {
        this._analyser.getFloatTimeDomainData(this._preciseTimeDomainData);

        return this._preciseTimeDomainData;
    }

    /**
     * @public
     * @returns {Float32Array}
     */
    getPreciseFrequencyData() {
        this._analyser.getFloatFrequencyData(this._preciseFrequencyData);

        return this._preciseFrequencyData;
    }

    /**
     * @public
     */
    destroy() {
        this._timeDomainData = null;
        this._frequencyData = null;
        this._preciseTimeDomainData = null;
        this._preciseFrequencyData = null;

        this._targetNode.disconnect(this._analyser);
        this._targetNode = null;

        this._analyser.disconnect();
        this._analyser = null;

        this._context = null;
    }
}
