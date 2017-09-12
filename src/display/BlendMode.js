/**
 * @class BlendMode
 */
export default class BlendMode {

    /**
     * @constructor
     * @param {Number} sFactor
     * @param {Number} dFactor
     * @param {String} canvasBlending
     */
    constructor(sFactor, dFactor, canvasBlending) {

        /**
         * @private
         * @member {Number}
         */
        this._sFactor = sFactor;

        /**
         * @private
         * @member {Number}
         */
        this._dFactor = dFactor;

        /**
         * @private
         * @member {String}
         */
        this._canvasBlending = canvasBlending;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get sFactor() {
        return this._sFactor;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get dFactor() {
        return this._dFactor;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get canvasBlending() {
        return this._canvasBlending;
    }

    /**
     * @public
     */
    destroy() {
        this._sFactor = null;
        this._dFactor = null;
        this._canvasBlending = null;
    }
}
