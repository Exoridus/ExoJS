import { SCALE_MODE, WRAP_MODE } from '../const';
import Vector from '../core/Vector';

/**
 * @class Texture
 * @memberof Exo
 */
export default class Texture {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement} [source=null]
     * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
     * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
     */
    constructor(source = null, scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement}
         */
        this._source = source;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = source ? new Vector(source.width, source.height) : new Vector();

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = scaleMode;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = wrapMode;

        /**
         * @private
         * @member {?WebGLTexture}
         */
        this._webGLTexture = null;
    }

    /**
     * @public
     * @member {HTMLImageElement|HTMLCanvasElement}
     */
    get source() {
        return this._source;
    }

    set source(value) {
        this._source = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(value) {
        this._size.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(value) {
        this._size.y = value;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @member {?WebGLTexture}
     */
    get webGLTexture() {
        return this._webGLTexture;
    }

    set webGLTexture(value) {
        this._webGLTexture = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._scaleMode;
    }

    set scaleMode(value) {
        this._scaleMode = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(value) {
        this._wrapMode = value;
    }

    /**
     * @public
     */
    destroy() {
        this._webGLTexture = null;
        this._source = null;
        this._size = null;
    }
}
