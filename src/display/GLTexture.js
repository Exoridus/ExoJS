import settings from '../settings';

const SCALE_MODE_DIRTY = 0x01,
    WRAP_MODE_DIRTY = 0x02,
    PREMULTIPLY_ALPHA_DIRTY = 0x04,
    SOURCE_DIRTY = 0x08;

/**
 * @class GLTexture
 * @memberof Exo
 */
export default class GLTexture {

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {WebGLRenderingContext} [options.context]
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} [options.source]
     * @param {Number} [options.scaleMode=Exo.settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=Exo.settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=Exo.settings.PREMULTIPLY_ALPHA]
     */
    constructor({ context, source, scaleMode = settings.SCALE_MODE, wrapMode = settings.WRAP_MODE, premultiplyAlpha = settings.PREMULTIPLY_ALPHA } = {}) {

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
        this._width = -1;

        /**
         * @private
         * @member {Number}
         */
        this._height = -1;

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
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Number}
         */
        this._dirty = 0;

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.setPremultiplyAlpha(premultiplyAlpha);

        if (source !== undefined) {
            this.setSource(source);
        }

        if (context !== undefined) {
            this.setContext(context);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._scaleMode;
    }

    set scaleMode(value) {
        this.setScaleMode(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(value) {
        this.setWrapMode(value);
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
     * @member {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement}
     */
    get source() {
        return this._source;
    }

    set source(value) {
        this.setSource(value);
    }

    /**
     * @public
     * @chainable
     * @param {WebGLRenderingContext} gl
     * @returns {Exo.GLTexture}
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._texture = gl.createTexture();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {Exo.GLTexture}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._dirty |= SCALE_MODE_DIRTY;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {Exo.GLTexture}
     */
    setWrapMode(wrapMode) {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._dirty |= WRAP_MODE_DIRTY;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} premultiplyAlpha
     * @returns {Exo.GLTexture}
     */
    setPremultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._dirty |= PREMULTIPLY_ALPHA_DIRTY;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
     * @returns {Exo.GLTexture}
     */
    setSource(source) {
        if (source) {
            this._source = source;
            this._dirty |= SOURCE_DIRTY;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [unit]
     * @returns {Exo.GLTexture}
     */
    bind(unit) {
        const gl = this._context;

        if (unit !== undefined) {
            gl.activeTexture(gl.TEXTURE0 + unit);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        if (this._dirty) {
            this._updateParameters();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.GLTexture}
     */
    unbind() {
        const gl = this._context;

        gl.bindTexture(gl.TEXTURE_2D, null);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        if (this._context) {
            this._context.deleteTexture(this._texture);
            this._context = null;
            this._texture = null;
        }

        this._width = null;
        this._height = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._source = null;
        this._dirty = null;
    }

    /**
     * @private
     */
    _updateParameters() {
        const gl = this._context,
            flag = this._dirty;

        if (flag & SCALE_MODE_DIRTY !== 0) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);
        }

        if (flag & WRAP_MODE_DIRTY !== 0) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);
        }

        if (flag & PREMULTIPLY_ALPHA_DIRTY !== 0) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);
        }

        if (flag & SOURCE_DIRTY !== 0) {
            this._updateSource();
        }

        this._dirty = 0;
    }

    /**
     * @private
     */
    _updateSource() {
        const gl = this._context,
            source = this._source,
            width = source.videoWidth || source.width,
            height = source.videoHeight || source.height;

        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            return;
        }

        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
}
