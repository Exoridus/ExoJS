import settings from '../settings';
import { addFlag, hasFlag, removeFlag } from '../utils';
import Rectangle from '../math/Rectangle';

const FLAGS = {
    NONE: 0,
    SCALE_MODE: 1 << 0,
    WRAP_MODE: 1 << 1,
    PREMULTIPLY_ALPHA: 1 << 2,
    SOURCE: 1 << 3,
    SOURCE_FRAME: 1 << 4,
};

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
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA
    } = {}) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._sourceFrame = new Rectangle();

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?GLTexture}
         */
        this._glTexture = null;

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = null;

        /**
         * @private
         * @member {Number}
         */
        this._flags = FLAGS.NONE;

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.setPremultiplyAlpha(premultiplyAlpha);

        if (source) {
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
     * @readonly
     * @member {Rectangle}
     */
    get sourceFrame() {
        if (hasFlag(FLAGS.SOURCE_FRAME, this._flags)) {
            const source = this._source,
                width = source ? (source.videoWidth || source.width) : 0,
                height = source ? (source.videoHeight || source.height) : 0;

            this._sourceFrame.set(0, 0, width, height);
            this._flags = removeFlag(FLAGS.SOURCE_FRAME, this._flags);
        }

        return this._sourceFrame;
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
     * @readonly
     * @member {Size}
     */
    get size() {
        return this.sourceFrame.size;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this.sourceFrame.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this.sourceFrame.height;
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
     * @param {Number} scaleMode
     * @returns {Texture}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._flags = addFlag(FLAGS.SCALE_MODE, this._flags);
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
            this._flags = addFlag(FLAGS.WRAP_MODE, this._flags);
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
            this._flags = addFlag(FLAGS.PREMULTIPLY_ALPHA, this._flags);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    updateSource() {
        this._flags = addFlag(FLAGS.SOURCE | FLAGS.SOURCE_FRAME, this._flags);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        if (this._flags && this._glTexture) {
            this._renderState.glTexture = this._glTexture;

            if (hasFlag(FLAGS.SCALE_MODE, this._flags)) {
                this._glTexture.setScaleMode(this._scaleMode);

                this._flags = removeFlag(FLAGS.SCALE_MODE, this._flags);
            }

            if (hasFlag(FLAGS.WRAP_MODE, this._flags)) {
                this._glTexture.setWrapMode(this._wrapMode);

                this._flags = removeFlag(FLAGS.WRAP_MODE, this._flags);
            }

            if (hasFlag(FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                this._glTexture.setPremultiplyAlpha(this._premultiplyAlpha);

                this._flags = removeFlag(FLAGS.PREMULTIPLY_ALPHA, this._flags);
            }

            if (hasFlag(FLAGS.SOURCE, this._flags) && this._source) {
                this._glTexture.setTextureSource(this._source);

                this._flags = removeFlag(FLAGS.SOURCE, this._flags);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {RenderState} renderState
     * @param {Number}  [unit]
     * @returns {Texture}
     */
    bind(renderState, unit) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._glTexture = renderState.createGLTexture();
        }

        if (unit !== undefined) {
            this._renderState.textureUnit = unit;
        }

        this._renderState.glTexture = this._glTexture;

        this.update();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    unbind() {
        if (this._renderState && this._renderState.glTexture === this._glTexture) {
            this._renderState.glTexture = null;
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._renderState) {
            this.unbind();

            this._glTexture.destroy();
            this._glTexture = null;

            this._renderState = null;
        }

        this._source = null;

        this._sourceFrame.destroy();
        this._sourceFrame = null;

        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._flags = null;
    }
}
