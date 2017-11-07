/**
 * @class GLFramebuffer
 */
export default class GLFramebuffer {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {Boolean} isRoot
     */
    constructor(context, isRoot) {
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
        this._framebuffer = isRoot ? null : context.createFramebuffer();
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
        if (this._framebuffer) {
            this._context.deleteFramebuffer(this._framebuffer);
        }

        this._framebuffer = null;
        this._context = null;
    }
}
