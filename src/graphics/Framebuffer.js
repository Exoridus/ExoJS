/**
 * @class Framebuffer
 */
export default class Framebuffer {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {Boolean} [root=false]
     */
    constructor(context, root = false) {
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
         * @member {?WebGLFramebuffer}
         */
        this._framebuffer = root ? null : context.createFramebuffer();
    }

    /**
     * @public
     * @chainable
     * @param {Color} [color]
     * @returns {Framebuffer}
     */
    clear(color) {
        const gl = this._context;

        if (color) {
            gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} width
     * @param {Number} height
     * @returns {Framebuffer}
     */
    viewport(x, y, width, height) {
        const gl = this._context;

        gl.viewport(x, y, width, height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {GLTexture} texture
     * @returns {Framebuffer}
     */
    attachTexture(texture) {
        const gl = this._context;

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.texture, 0);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Framebuffer}
     */
    bind() {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Framebuffer}
     */
    unbind() {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        const gl = this._context;

        gl.deleteFramebuffer(this._framebuffer);

        this._framebuffer = null;
        this._context = null;
    }
}
