import Vector from '../core/Vector';

/**
 * @class RenderTarget
 */
export default class RenderTarget {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} [isRoot = false]
     */
    constructor(width, height, isRoot = false) {

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._frameBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;

        /**
         * @private
         * @member {Vector}
         */
        this._size = new Vector(width, height);
    }

    /**
     * @public
     * @member {Vector}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size.copy(size);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(width) {
        this._size.x = width | 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(height) {
        this._size.y = height | 0;
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._frameBuffer = this._isRoot ? null : gl.createFramebuffer();
        }
    }

    /**
     * @public
     */
    bind() {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
    }

    /**
     * @public
     */
    destroy() {
        if (this._frameBuffer) {
            this._context.deleteFramebuffer(this._frameBuffer);
            this._frameBuffer = null;
        }

        this._size.destroy();
        this._size = null;

        this._isRoot = null;
        this._context = null;
    }
}
