/**
 * @class ScaleModes
 * @memberof Exo
 */
export default class ScaleModes {

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Linear() {
        return 0;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Nearest() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Default() {
        return ScaleModes.Nearest;
    }

    /**
     * @public
     * @static
     * @param {WebGLRenderingContext} gl
     * @param {Number} scaleMode
     * @returns {Number}
     */
    static getGLEnum(gl, scaleMode) {
        return (scaleMode === ScaleModes.Linear) ? gl.LINEAR : gl.NEAREST;
    }
}
