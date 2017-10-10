import Rectangle from '../core/shape/Rectangle';
import GLTexture from './GLTexture';

/**
 * @class Texture
 */
export default class Texture {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @param {Number} [options]
     * @param {Number} [options.scaleMode]
     * @param {Number} [options.wrapMode]
     * @param {Boolean} [options.premultiplyAlpha]
     */
    constructor(source, options) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._frame = new Rectangle();

        /**
         * @private
         * @member {GLTexture}
         */
        this._glTexture = new GLTexture(options);

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

    set source(source) {
        this.setSource(source);
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._glTexture.scaleMode;
    }

    set scaleMode(scaleMode) {
        this._glTexture.setScaleMode(scaleMode);
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._glTexture.wrapMode;
    }

    set wrapMode(wrapMode) {
        this._glTexture.setWrapMode(wrapMode);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get premultiplyAlpha() {
        return this._glTexture.premultiplyAlpha;
    }

    set premultiplyAlpha(premultiplyAlpha) {
        this._glTexture.setPremultiplyAlpha(premultiplyAlpha);
    }

    /**
     * @public
     * @readonly
     * @member {GLTexture}
     */
    get glTexture() {
        return this._glTexture;
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get frame() {
        return this._frame;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
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
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @returns {Texture}
     */
    setSource(source) {
        if (this._source !== source) {
            this._source = source;

            if (source) {
                this._frame.set(0, 0, (source.videoWidth || source.width), (source.videoHeight || source.height));
            } else {
                this._frame.set(0, 0, 0, 0);
            }

            this._glTexture.setSource(source);
        }

        this._glTexture.invalidateSource();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        this._glTexture
            .invalidateSource()
            .update();

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._source = null;

        this._frame.destroy();
        this._frame = null;

        this._glTexture.destroy();
        this._glTexture = null;
    }
}
