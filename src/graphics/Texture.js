import settings from '../settings';
import { addFlag, hasFlag, removeFlag } from '../utils';
import Size from '../math/Size';
import GLTexture from './GLTexture';
import { TEXTURE_FLAGS } from '../const';

/**
 * @class Texture
 */
export default class Texture {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @param {Object} [options={}]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    constructor(source, {
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA,
    } = {}) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size();

        /**
         * @private
         * @member {?GLTexture}
         */
        this._texture = null;

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
         * @member {Boolean}
         */
        this._premultiplyAlpha = premultiplyAlpha;

        /**
         * @private
         * @member {Number}
         */
        this._flags = (TEXTURE_FLAGS.SCALE_MODE | TEXTURE_FLAGS.WRAP_MODE | TEXTURE_FLAGS.PREMULTIPLY_ALPHA);

        if (source) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @readonly
     * @member {?GLTexture}
     */
    get glTexture() {
        return this._texture;
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
        return this._scaleMode;
    }

    set scaleMode(scaleMode) {
        this.setScaleMode(scaleMode);
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(wrapMode) {
        this.setWrapMode(wrapMode);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get premultiplyAlpha() {
        return this._premultiplyAlpha;
    }

    set premultiplyAlpha(premultiplyAlpha) {
        this.setPremultiplyAlpha(premultiplyAlpha);
    }

    /**
     * @public
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size.copy(size);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this._size.width = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this._size.height = height;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return !!this._displayManager && (this._displayManager.texture === this);
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {Texture}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._flags = addFlag(TEXTURE_FLAGS.SCALE_MODE, this._flags);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {Texture}
     */
    setWrapMode(wrapMode) {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags = addFlag(TEXTURE_FLAGS.WRAP_MODE, this._flags);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} premultiplyAlpha
     * @returns {Texture}
     */
    setPremultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags = addFlag(TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
        }

        return this;
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
            this.updateSource();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    updateSource() {
        this._flags = addFlag(TEXTURE_FLAGS.SOURCE, this._flags);

        this._size.set(
            (this._source && this._source.naturalWidth || this._source.videoWidth || this._source.width) || 0,
            (this._source && this._source.naturalHeight || this._source.videoHeight || this._source.height) || 0
        );

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        if (this._flags && this._texture) {

            if (hasFlag(TEXTURE_FLAGS.SCALE_MODE, this._flags)) {
                this._texture.setScaleMode(this._scaleMode);
                this._flags = removeFlag(TEXTURE_FLAGS.SCALE_MODE, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.WRAP_MODE, this._flags)) {
                this._texture.setWrapMode(this._wrapMode);
                this._flags = removeFlag(TEXTURE_FLAGS.WRAP_MODE, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                this._texture.setPremultiplyAlpha(this._premultiplyAlpha);
                this._flags = removeFlag(TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.SOURCE, this._flags) && this._source) {
                this._texture.setTextureSource(this._source);
                this._flags = removeFlag(TEXTURE_FLAGS.SOURCE, this._flags);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Texture}
     */
    bind(displayManager) {
        if (!this._texture) {
            this._texture = new GLTexture(displayManager.context);
            this._displayManager = displayManager;
        }

        if (!this.bound) {
            this._texture.bind();
            this.update();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    unbind() {
        if (this.bound) {
            this._texture.unbind();
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.unbind();

        if (this._texture) {
            this._texture.destroy();
            this._texture = null;
        }

        this._size.destroy();
        this._size = null;

        this._flags = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._source = null;
        this._displayManager = null;
    }
}
