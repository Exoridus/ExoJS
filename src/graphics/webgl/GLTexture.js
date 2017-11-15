import Size from '../../math/Size';
import { getMediaHeight, getMediaWidth } from '../../utils';

/**
 * @class GLTexture
 */
export default class GLTexture {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     */
    constructor(context) {
        if (!context) {
            throw new Error('No Rendering Context was provided.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {WebGLTexture}
         */
        this._texture = context.createTexture();

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(-1, -1);
    }

    /**
     * @public
     * @readonly
     * @member {WebGLTexture}
     */
    get texture() {
        return this._texture;
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {GLTexture}
     */
    setScaleMode(scaleMode) {
        const gl = this._context;

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scaleMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scaleMode);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {GLTexture}
     */
    setWrapMode(wrapMode) {
        const gl = this._context;

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} premultiplyAlpha
     * @returns {GLTexture}
     */
    setPremultiplyAlpha(premultiplyAlpha) {
        const gl = this._context;

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
     * @param {Number} [width=getMediaWidth(source)]
     * @param {Number} [height=getMediaHeight(source)]
     * @returns {GLTexture}
     */
    setTextureSource(source, width = getMediaWidth(source), height = getMediaHeight(source)) {
        const gl = this._context;

        if (this._size.width !== width || this._size.height !== height) {
            this._size.set(width, height);

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?DataView} source
     * @param {Number} width
     * @param {Number} height
     * @returns {GLTexture}
     */
    setDataSource(source, width, height) {
        const gl = this._context;

        if (this._size.width !== width || this._size.height !== height) {
            this._size.set(width, height);

            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }

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
     * @public
     */
    destroy() {
        const gl = this._context;

        gl.deleteTexture(this._texture);

        this._size.destroy();
        this._size = null;

        this._context = null;
        this._texture = null;
    }
}
