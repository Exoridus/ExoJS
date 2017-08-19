/**
 * @class WrapModes
 * @memberof Exo
 */
export default class WrapModes {

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get ClampToEdge() {
        return 0;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Repeat() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get MirroredRepeat() {
        return 2;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Default() {
        return WrapModes.ClampToEdge;
    }

    /**
     * @public
     * @static
     * @param {WebGLRenderingContext} gl
     * @param {Number} wrapMode
     * @returns {Number}
     */
    static getGLEnum(gl, wrapMode) {
        if (wrapMode === WrapModes.ClampToEdge) {
            return gl.CLAMP_TO_EDGE;
        }

        return (wrapMode === WrapModes.Repeat) ? gl.REPEAT : gl.MIRRORED_REPEAT;
    }
}
