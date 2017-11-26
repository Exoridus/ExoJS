import settings from '../settings';
import { addFlag, getMediaHeight, getMediaWidth, hasFlag, isPowerOfTwo, removeFlag } from '../utils';
import Size from '../math/Size';
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
        this._size = new Size(-1, -1);

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLTexture}
         */
        this._texture = null;

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
        this._flags = TEXTURE_FLAGS.NONE;

        /**
         * @private
         * @member {Boolean}
         */
        this._flipY = false;

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
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this.setSize(size.width, size.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this.setSize(width, this.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this.setSize(this.width, height);
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
     * @member {Boolean}
     */
    get flipY() {
        return this._flipY;
    }

    set flipY(flipY) {
        this._flipY = flipY;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get powerOfTwo() {
        return isPowerOfTwo(this.width)
            && isPowerOfTwo(this.height);
    }

    /**
     * @public
     * @chainable
     * @param {WebGLRenderingContext} gl
     * @returns {Texture}
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._texture = gl.createTexture();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    disconnect() {
        this.unbindTexture();

        if (this._context) {
            this._context.deleteTexture(this._texture);

            this._context = null;
            this._texture = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [unit]
     * @returns {Texture}
     */
    bindTexture(unit) {
        if (!this._context) {
            throw new Error('Texture has to be connected first!')
        }

        const gl = this._context;

        if (unit !== undefined) {
            gl.activeTexture(gl.TEXTURE0 + unit);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        this.update();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    unbindTexture() {
        if (this._context) {
            const gl = this._context;

            gl.bindTexture(gl.TEXTURE_2D, null);
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

        this.setSize(
            getMediaWidth(this._source),
            getMediaHeight(this._source)
        );

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Texture}
     */
    setSize(width, height) {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._flags = addFlag(TEXTURE_FLAGS.SIZE, this._flags);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        if (this._flags && this._context) {
            const gl = this._context;

            if (hasFlag(TEXTURE_FLAGS.SCALE_MODE, this._flags)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                this._flags = removeFlag(TEXTURE_FLAGS.SCALE_MODE, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.WRAP_MODE, this._flags)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                this._flags = removeFlag(TEXTURE_FLAGS.WRAP_MODE, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                this._flags = removeFlag(TEXTURE_FLAGS.PREMULTIPLY_ALPHA, this._flags);
            }

            if (hasFlag(TEXTURE_FLAGS.SOURCE, this._flags) && this._source) {
                if (hasFlag(TEXTURE_FLAGS.SIZE, this._flags)) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this.powerOfTwo) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }

                this._flags = removeFlag(TEXTURE_FLAGS.SOURCE | TEXTURE_FLAGS.SIZE, this._flags);
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._size.destroy();
        this._size = null;

        this._source = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._flags = null;
        this._context = null;
        this._texture = null;
        this._flipY = null;
    }
}
