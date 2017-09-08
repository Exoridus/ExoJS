import Vector from '../core/Vector';
import settings from '../settings';
import Rectangle from '../core/Rectangle';
import GLTexture from './GLTexture';

/**
 * @class Texture
 * @memberof Exo
 */
export default class Texture {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @param {Number} [options]
     * @param {Number} [options.scaleMode=Exo.settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=Exo.settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=Exo.settings.PREMULTIPLY_ALPHA]
     */
    constructor(source, { scaleMode = settings.SCALE_MODE, wrapMode = settings.WRAP_MODE, premultiplyAlpha = settings.PREMULTIPLY_ALPHA } = {}) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

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
         * @member {Number}
         */
        this._premultiplyAlpha = premultiplyAlpha;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._frame = new Rectangle();

        /**
         * @private
         * @member {Exo.GLTexture}
         */
        this._glTexture = new GLTexture({ source, scaleMode, wrapMode, premultiplyAlpha });

        if (source !== undefined) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
     */
    get source() {
        return this._source;
    }

    set source(value) {
        this.setSource(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._scaleMode;
    }

    set scaleMode(value) {
        this._glTexture.scaleMode = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(value) {
        if (this._wrapMode !== value) {
            this._wrapMode = value;
            this._glTexture.wrapMode = value;
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get premultiplyAlpha() {
        return this._premultiplyAlpha;
    }

    set premultiplyAlpha(value) {
        this.setPremultiplyAlpha(value);
    }

    /**
     * @public
     * @member {?Exo.GLTexture}
     */
    get glTexture() {
        return this._glTexture;
    }

    set glTexture(value) {
        this._glTexture = value;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
     */
    get frame() {
        return this._frame;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Vector}
     */
    get size() {
        return this._frame.size;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._frame.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._frame.height;
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {Exo.GLTexture}
     */
    setScaleMode(scaleMode) {
        this._glTexture.setScaleMode(scaleMode);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {Exo.GLTexture}
     */
    setWrapMode(wrapMode) {
        this._glTexture.setWrapMode(wrapMode);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} premultiplyAlpha
     * @returns {Exo.GLTexture}
     */
    setPremultiplyAlpha(premultiplyAlpha) {
        this._glTexture.setPremultiplyAlpha(premultiplyAlpha);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @returns {Exo.Texture}
     */
    setSource(source) {
        this._source = source;

        if (source) {
            this._frame.set(0, 0, source.videoWidth || source.width, source.videoHeight || source.height);
        } else {
            this._frame.set(0, 0, 0, 0);
        }

        this._glTexture.setSource(source);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._source = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;

        this._frame.destroy();
        this._frame = null;

        this._glTexture.destroy();
        this._glTexture = null;
    }
}
