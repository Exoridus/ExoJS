/**
 * @class Renderer
 */
export default class Renderer {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._indexBuffer = null;
    }

    /**
     * @public
     * @abstract
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._indexBuffer = gl.createBuffer();
            this._vertexBuffer = gl.createBuffer();
        }
    }

    /**
     * @public
     * @abstract
     */
    bind() {
        // do nothing
    }

    /**
     * @public
     * @abstract
     */
    unbind() {
        // do nothing
    }

    /**
     * @public
     * @abstract
     * @param {*} renderable
     */
    render(renderable) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @abstract
     */
    flush() {
        // do nothing
    }

    /**
     * @public
     */
    destroy() {
        if (this._context) {
            this._context.deleteBuffer(this._indexBuffer);
            this._indexBuffer = null;

            this._context.deleteBuffer(this._vertexBuffer);
            this._vertexBuffer = null;

            this._context = null;
        }
    }

    /**
     * @public
     * @param {Number} size
     * @returns {Uint16Array}
     */
    static createIndexBuffer(size) {
        const buffer = new Uint16Array(size * 6),
            len = buffer.length;

        for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
            buffer[i] = offset;
            buffer[i + 1] = offset + 1;
            buffer[i + 2] = offset + 3;
            buffer[i + 3] = offset;
            buffer[i + 4] = offset + 2;
            buffer[i + 5] = offset + 3;
        }

        return buffer;
    }
}
