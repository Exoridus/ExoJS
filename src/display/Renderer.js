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
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (this._context) {
            return;
        }

        this._context = gl;
        this._indexBuffer = gl.createBuffer();
        this._vertexBuffer = gl.createBuffer();
    }

    /**
     * @public
     * @param {Number} length
     * @returns {Uint16Array}
     */
    createIndexBuffer(length) {
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

    /**
     * @public
     */
    start() {
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
    stop() {
        this.flush();
    }
}
