import Texture from './Texture';
import RenderTarget from './RenderTarget';

/**
 * @class RenderTexture
 * @extends Texture
 */
export default class RenderTexture extends Texture {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Object} [options]
     * @param {Number} [options.scaleMode]
     * @param {Number} [options.wrapMode]
     * @param {Boolean} [options.premultiplyAlpha]
     */
    constructor(width, height, options) {
        super(null, options);

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = new RenderTarget(width, height, false);

        this.resize(width, height);
    }

    /**
     * @public
     * @param {Number} newWidth
     * @param {Number} newHeight
     */
    resize(newWidth, newHeight) {
        const width = Math.ceil(newWidth),
            height = Math.ceil(newHeight);

        if (this.width !== width || this.height !== height) {
            this.width = width;
            this.height = height;

            this._renderTarget.resize(width, height);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GLFramebuffer}
     */
    enableTexture(glTextuze = new GLTexture(this._context)) {
        const gl = this._context;

        this.bind();

        glTextuze.bind();

        this.resize(this._size.width, this._size.height); // this._glTexture.setDataSource(null, width, height);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture.texture, 0);

        return this;
    }

    /**
     * @override
     */
    bind(displayManager, unit) {
        super.bind(displayManager, unit);

        if (!this._renderTarget.bound) {
            this._renderTarget.bind(displayManager);
        }

        return this;
    }

    /**
     * @override
     */
    unbind() {
        super.unbind();

        if (this._renderTarget.bound) {
            this._renderTarget.unbind();
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._renderTarget.destroy();
        this._renderTarget = null;
    }
}
