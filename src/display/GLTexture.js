import settings from '../settings';

const flags = {
    SCALE_MODE: 1 << 0,
    WRAP_MODE: 1 << 1,
    PREMULTIPLY_ALPHA: 1 << 2,
    SOURCE: 1 << 3,
};

/**
 * @class GLTexture
 */
export default class GLTexture {

    /**
     * @constructor
     * @param {Object} [options={}]
     * @param {WebGLRenderingContext} [options.context]
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} [options.source]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     */
    constructor({ context, source, width = -1, height = -1, scaleMode = settings.SCALE_MODE, wrapMode = settings.WRAP_MODE, premultiplyAlpha = settings.PREMULTIPLY_ALPHA } = {}) {

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
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Number}
         */
        this._width = width;

        /**
         * @private
         * @member {Number}
         */
        this._height = height;

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
        this._flags = (flags.SCALE_MODE | flags.WRAP_MODE | flags.PREMULTIPLY_ALPHA);

        if (context !== undefined) {
            this.setContext(context);
        }

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
     * @chainable
     * @param {WebGLRenderingContext} gl
     * @returns {GLTexture}
     */
    setContext(gl) {
        if (this._context !== gl) {
            this._context = gl;
            this._texture = gl.createTexture();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement} source
     * @returns {GLTexture}
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
     * @returns {GLTexture}
     */
    updateSource() {
        if (this._source) {
            this._flags |= flags.SOURCE;
        } else {
            this._flags &= ~flags.SOURCE;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {GLTexture}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._flags |= flags.SCALE_MODE;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {GLTexture}
     */
    setWrapMode(wrapMode) {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags |= flags.WRAP_MODE;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} premultiplyAlpha
     * @returns {GLTexture}
     */
    setPremultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags |= flags.PREMULTIPLY_ALPHA;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [unit]
     * @returns {GLTexture}
     */
    update(unit) {
        if (!this._flags) {
            return this;
        }

        this.bind(unit);

        const gl = this._context;

        if (this._flags & flags.SCALE_MODE) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);
        }

        if (this._flags & flags.WRAP_MODE) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);
        }

        if (this._flags & flags.PREMULTIPLY_ALPHA) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);
        }

        if (this._flags & flags.SOURCE) {
            const source = this._source,
                width = source.videoWidth || source.width,
                height = source.videoHeight || source.height;

            if (this._width !== width || this._height !== height) {
                this._width = width;
                this._height = height;

                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            } else {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
            }
        }

        this._flags = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [unit]
     * @returns {GLTexture}
     */
    bind(unit) {
        const gl = this._context;

        if (unit !== undefined) {
            gl.activeTexture(gl.TEXTURE0 + unit);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GLTexture}
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
        this._flags = null;
    }
}
