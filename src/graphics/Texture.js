import Rectangle from '../math/Rectangle';
import Vector from '../math/Vector';
import settings from '../settings';

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
        this._flags = (FLAGS.SCALE_MODE | FLAGS.WRAP_MODE | FLAGS.PREMULTIPLY_ALPHA);

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
        if (this.hasFlag(FLAGS.SOURCE_FRAME)) {
            if (this._source) {
                this._sourceFrame.set(0, 0, (this._source.videoWidth || this._source.width), (this._source.videoHeight || this._source.height));
            } else {
                this._sourceFrame.set(0, 0, 0, 0);
            }

            this.removeFlag(FLAGS.SOURCE_FRAME);
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
     * @member {Vector}
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

            this.addFlag(FLAGS.SCALE_MODE);
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

            this.addFlag(FLAGS.WRAP_MODE);
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

            this.addFlag(FLAGS.PREMULTIPLY_ALPHA);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    updateSource() {
        return this
            .addFlag(FLAGS.SOURCE)
            .addFlag(FLAGS.SOURCE_FRAME);
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        if (this._flags && this._renderState) {
            if (this.hasFlag(FLAGS.SCALE_MODE)) {
                this._renderState.setScaleMode(this, this._scaleMode);

                this.removeFlag(FLAGS.SCALE_MODE);
            }

            if (this.hasFlag(FLAGS.WRAP_MODE)) {
                this._renderState.setWrapMode(this, this._wrapMode);

                this.removeFlag(FLAGS.WRAP_MODE);
            }

            if (this.hasFlag(FLAGS.PREMULTIPLY_ALPHA)) {
                this._renderState.setPremultiplyAlpha(this, this._premultiplyAlpha);

                this.removeFlag(FLAGS.PREMULTIPLY_ALPHA);
            }

            if (this.hasFlag(FLAGS.SOURCE) && this._source) {
                this._renderState.setTextureImage(this, this._source);

                this.removeFlag(FLAGS.SOURCE);
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
        }

        this._renderState.bindTexture(this, unit);

        return this;
    }

    /**
     * @public
     * @param {Number} flag
     * @returns {Boolean}
     */
    hasFlag(flag) {
        return (this._flags & flag) !== 0;
    }

    /**
     * @public
     * @chainable
     * @param {Number} flag
     * @returns {Texture}
     */
    addFlag(flag) {
        this._flags |= flag;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} flag
     * @returns {Texture}
     */
    removeFlag(flag) {
        this._flags &= ~flag;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._renderState) {
            this._renderState.removeTexture(this);
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
