import ScaleModes from './constants/ScaleModes';
import WrapModes from './constants/WrapModes';
import Vector from '../core/Vector';

/**
 * @class Texture
 * @memberof Exo
 */
export default class Texture {

    /**
     * @constructor
     * @param {HTMLImageElement|HTMLCanvasElement} [source]
     * @param {Number} [scaleMode]
     * @param {Number} [wrapMode]
     */
    constructor(source, scaleMode, wrapMode) {

        /**
         * @private
         * @member {HTMLImageElement|HTMLCanvasElement|null}
         */
        this._source = source || null;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = source ? new Vector(source.width, source.height) : new Vector();

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = (typeof scaleMode === 'number') ? scaleMode : ScaleModes.Default;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = (typeof wrapMode === 'number') ? scaleMode : WrapModes.Default;

        /**
         * @private
         * @member {WebGLTexture|null}
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

        if (this._webGLTexture) {
            this._webGLTexture.setSource(value);
        }
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
     * @member {WebGLTexture|null}
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

        if (this._webGLTexture) {
            this._webGLTexture.setScaleMode(value);
        }
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

        if (this._webGLTexture) {
            this._webGLTexture.setWrapMode(value);
        }
    }

    /**
     * @public
     */
    destroy() {
        if (this._webGLTexture) {
            this._webGLTexture.destroy();
            this._webGLTexture = null;
        }
        this._source = null;
        this._size = null;
    }
}
