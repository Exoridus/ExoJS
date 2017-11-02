import settings from '../settings';
import Size from '../math/Size';

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
            throw new Error('This browser or hardware does not support WebGL.');
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
     * @chainable
     * @returns {GLTexture}
     */
    bind() {
        const gl = this._context;

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
     * @returns {GLTexture}
     */
    setTextureImage(source) {
        const gl = this._context,
            width = (source.videoWidth || source.width),
            height = (source.videoHeight || source.height);

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
     */
    destroy() {
        this._context.deleteTexture(this._texture);

        this._size.destroy();
        this._size = null;

        this._texture = null;
        this._context = null;
    }
}
