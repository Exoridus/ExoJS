import ScaleModes from './constants/ScaleModes';
import WrapModes from './constants/WrapModes';

/**
 * Helper class to create a WebGL Texture
 *
 * @class WebGLTexture
 * @memberof Exo
 */
export default class WebGLTexture {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context The current WebGL context
     */
    constructor(context) {

        /**
         * The current WebGL rendering context
         *
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * The WebGL texture
         *
         * @private
         * @member {WebGLTexture}
         */
        this._texture = context.createTexture();

        /**
         * Set to true to enable pre-multiplied alpha
         *
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = true;

        /**
         * The width of texture
         *
         * @private
         * @member {Number}
         */
        this._width = -1;

        /**
         * The height of texture
         *
         * @private
         * @member {Number}
         */
        this._height = -1;
    }

    /**
     * Binds the texture
     * @param {Number} [textureUnit]
     */
    bind(textureUnit) {
        const gl = this._context;

        if (typeof textureUnit === 'number') {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);
    }

    /**
     * Unbinds the texture
     */
    unbind() {
        const gl = this._context;

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Uploads this texture to the GPU
     *
     * @public
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source the source image of the texture
     */
    setSource(source) {
        const gl = this._context,
            newWidth = source.videoWidth || source.width,
            newHeight = source.videoHeight || source.height;

        this.bind();

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

        if (newHeight !== this._height || newWidth !== this._width) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }

        // if the source is a video, we need to use the videoWidth / videoHeight properties
        this._width = newWidth;
        this._height = newHeight;
    }

    /**
     * @public
     * @param {Number} scaleMode
     */
    setScaleMode(scaleMode) {
        const gl = this._context,
            scale = ScaleModes.getGLEnum(scaleMode);

        this.bind();

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scale);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scale);
    }

    /**
     * @public
     * @param {Number} wrapMode
     */
    setWrapMode(wrapMode) {
        const gl = this._context,
            wrap = WrapModes.getGLEnum(wrapMode);

        this.bind();

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    }

    /**
     * Destroys this texture
     */
    destroy() {
        this._context.deleteTexture(this._texture);
        this._texture = null;
        this._context = null;
    }
}
