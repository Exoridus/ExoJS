import { TEXTURE_FLAGS } from '../../const/graphics';
import settings from '../../settings';
import { isPowerOfTwo } from '../../utils/math';
import RenderTarget from '../RenderTarget';
import Flags from '../../math/Flags';

/**
 * @class RenderTexture
 * @extends RenderTarget
 */
export default class RenderTexture extends RenderTarget {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Object} [options]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     * @param {Boolean} [options.generateMipMap=settings.GENERATE_MIPMAP]
     */
    constructor(width, height, {
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA,
        generateMipMap = settings.GENERATE_MIPMAP,
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
         * @member {Boolean}
         */
        this._generateMipMap = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._flipY = true;

        /**
         * @private
         * @member {Flags}
         */
        this._flags = new Flags(TEXTURE_FLAGS.SOURCE, TEXTURE_FLAGS.SIZE);

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.premultiplyAlpha = premultiplyAlpha;
        this.generateMipMap = generateMipMap;
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
    get generateMipMap() {
        return this._generateMipMap;
    }

    set generateMipMap(generateMipMap) {
        this._generateMipMap = generateMipMap;
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
        return isPowerOfTwo(this.width) && isPowerOfTwo(this.height);
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
            this._flags.add(TEXTURE_FLAGS.SCALE_MODE);
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
            this._flags.add(TEXTURE_FLAGS.WRAP_MODE);
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
            this._flags.add(TEXTURE_FLAGS.PREMULTIPLY_ALPHA);
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
            this._defaultView.resize(width, height);
            this.updateViewport();

            this._flags.add(TEXTURE_FLAGS.SIZE);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTexture}
     */
    update() {
        if (this._flags.value && this._context) {
            const gl = this._context;

            if (this._flags.has(TEXTURE_FLAGS.SCALE_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                this._flags.remove(TEXTURE_FLAGS.SCALE_MODE);
            }

            if (this._flags.has(TEXTURE_FLAGS.WRAP_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                this._flags.remove(TEXTURE_FLAGS.WRAP_MODE);
            }

            if (this._flags.has(TEXTURE_FLAGS.PREMULTIPLY_ALPHA)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                this._flags.remove(TEXTURE_FLAGS.PREMULTIPLY_ALPHA);
            }

            if (this._flags.has(TEXTURE_FLAGS.SOURCE)) {
                if (this._flags.has(TEXTURE_FLAGS.SIZE) || !this._source) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this._generateMipMap) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }

                this._flags.remove(TEXTURE_FLAGS.SOURCE, TEXTURE_FLAGS.SIZE);
            }
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._flags.destroy();
        this._flags = null;

        this._source = null;
        this._texture = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._flipY = null;
    }
}
