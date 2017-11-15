/**
 * @class GLFramebuffer
 */
export default class GLFramebuffer {

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
         * @member {WebGLFramebuffer}
         */
        this._framebuffer = context.createFramebuffer();
    }

    /**
     * @public
     * @chainable
     * @param {Color} [color]
     * @returns {GLFramebuffer}
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
     * @returns {GLFramebuffer}
     */
    bind() {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GLFramebuffer}
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

        this._context = null;
        this._framebuffer = null;
    }
}
