import settings from '../settings';
import { addFlag, getMediaHeight, getMediaWidth, hasFlag, isPowerOfTwo, removeFlag } from '../utils';
import { TEXTURE_FLAGS } from '../const';
import RenderTarget from './RenderTarget';
import { SCALE_MODE, WRAP_MODE } from '../const';

/**
 * @class RenderTexture
 * @extends RenderTarget
 */
export default class RenderTexture extends RenderTarget {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Object} [options={}]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    constructor(width, height, {
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA,
    } = {}) {
        super(width, height, false);

        /**
         * @private
         * @member {?DataView}
         */
        this._source = null;

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
        this._flags = (TEXTURE_FLAGS.SOURCE | TEXTURE_FLAGS.SIZE);

        /**
         * @private
         * @member {Boolean}
         */
        this._flipY = true;

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.setPremultiplyAlpha(premultiplyAlpha);
    }

    /**
     * @public
     * @member {?DataView}
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
     * @member {Boolean}
     */
    get flipY() {
        return this._flipY;
    }

    set flipY(flipY) {
        this._flipY = flipY;
    }

    /**
     * @override
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._texture = gl.createTexture();
            this._framebuffer = gl.createFramebuffer();

            this.bindTexture();
            this.bindFramebuffer();

            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture, 0);

            this.unbindTexture();
            this.unbindFramebuffer();
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        this.unbindFramebuffer();
        this.unbindTexture();

        if (this._context) {
            this._context.deleteFramebuffer(this._framebuffer);
            this._context.deleteTexture(this._texture);

            this._context = null;
            this._texture = null;
            this._framebuffer = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
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
     * @returns {RenderTexture}
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
     * @returns {RenderTexture}
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
     * @returns {RenderTexture}
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
     * @returns {RenderTexture}
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
     * @param {?DataView} source
     * @returns {RenderTexture}
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
     * @returns {RenderTexture}
     */
    updateSource() {
        return this;
    }

    /**
     * @override
     */
    setSize(width, height) {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._defaultView.setSize(width, height);
            this.updateViewport();

            this._flags = addFlag(TEXTURE_FLAGS.SIZE, this._flags);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTexture}
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

            if (hasFlag(TEXTURE_FLAGS.SOURCE, this._flags)) {
                if (hasFlag(TEXTURE_FLAGS.SIZE, this._flags) || !this._source) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
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
     * @override
     */
    destroy() {
        super.destroy();

        this._source = null;
        this._texture = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._flags = null;
        this._flipY = null;
    }
}
