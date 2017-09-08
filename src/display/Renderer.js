/**
 * @class Renderer
 * @memberof Exo
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
         * Vertex buffer that will be fed by the vertexData.
         *
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * Index buffer that will be fed by the indexData.
         *
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
     * @param {*} renderable
     */
    render(renderable) {
        // do nothing
    }

    /**
     * @public
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
     * @param {Number} length
     * @returns {Uint16Array}
     */
    static createIndexBuffer(length) {
        const buffer = new Uint16Array(length),
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
