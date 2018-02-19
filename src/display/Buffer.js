import { BUFFER_MODES, BUFFER_TYPES, EMPTY_ARRAY_BUFFER } from '../const';

/**
 * @class Buffer
 */
export default class Buffer {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView} data
     * @param {Number} type
     * @param {Number} mode
     */
    constructor(gl, data, type, mode) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @member {WebGLBuffer}
         */
        this._buffer = gl.createBuffer();

        /**
         * @member {Number}
         */
        this._data = EMPTY_ARRAY_BUFFER;

        /**
         * @member {Number}
         */
        this._type = type;

        /**
         * @member {Number}
         */
        this._mode = mode;

        if (data) {
            this.upload(data);
        }
    }

    /**
     * @public
     * @readonly
     * @member {WebGLBuffer}
     */
    get buffer() {
        return this._buffer;
    }

    /**
     * @public
     * @chainable
     * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView} data
     * @param {Number} [offset=0]
     * @returns {Buffer}
     */
    upload(data, offset = 0) {
        this.bind();

        if (this._data.byteLength >= data.byteLength) {
            this._context.bufferSubData(this._type, offset, data);
        } else {
            this._context.bufferData(this._type, data, this._mode);
        }

        this._data = data;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    bind() {
        this._context.bindBuffer(this._type, this._buffer);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    unbind() {
        this._context.bindBuffer(this._type, null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context = null;
        this._buffer = null;
        this._data = null;
        this._type = null;
        this._mode = null;
    }

    /**
     * @public
     * @static
     * @param {WebGL2RenderingContext} gl
     * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView} data
     * @param {Number} [mode=BUFFER_MODES.DYNAMIC_DRAW]
     * @returns {Buffer}
     */
    static createVertexBuffer(gl, data, mode = BUFFER_MODES.DYNAMIC_DRAW) {
        return new Buffer(gl, data, BUFFER_TYPES.ARRAY_BUFFER, mode);
    }

    /**
     * @public
     * @static
     * @param {WebGL2RenderingContext} gl
     * @param {Uint16Array} data
     * @param {Number} [mode=BUFFER_MODES.STATIC_DRAW]
     * @returns {Buffer}
     */
    static createIndexBuffer(gl, data, mode = BUFFER_MODES.STATIC_DRAW) {
        return new Buffer(gl, data, BUFFER_TYPES.INDEX_BUFFER, mode);
    }

    /**
     * @public
     * @static
     * @param {WebGL2RenderingContext} gl
     * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView} data
     * @param {Number} [mode=BUFFER_MODES.DYNAMIC_DRAW]
     * @returns {Buffer}
     */
    static createUniformBuffer(gl, data, mode = BUFFER_MODES.DYNAMIC_DRAW) {
        return new Buffer(gl, data, BUFFER_TYPES.UNIFORM_BUFFER, mode);
    }
}
