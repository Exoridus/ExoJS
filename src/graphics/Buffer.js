const EMPTY_ARRAY_BUFFER = new ArrayBuffer(0);

/**
 * @class Buffer
 */
export default class Buffer {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {Number} bufferType
     * @param {Number} drawType
     * @param {ArrayBuffer|ArrayBufferView} data
     */
    constructor(context, bufferType, drawType, data) {
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
         * @member {WebGLBuffer}
         */
        this._buffer = context.createBuffer();

        /**
         * @private
         * @member {Number}
         */
        this._bufferType = bufferType;

        /**
         * @private
         * @member {Number}
         */
        this._drawType = drawType;

        /**
         * @private
         * @member {ArrayBuffer|ArrayBufferView}
         */
        this._data = EMPTY_ARRAY_BUFFER;

        if (data) {
            this.setData(data);
        }
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer|ArrayBufferView}
     */
    get data() {
        return this._data;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    setData(data, offset = 0) {
        const gl = this._context;

        this.bind();

        if (this._data.byteLength >= data.byteLength) {
            gl.bufferSubData(this._bufferType, offset, data);
        } else {
            gl.bufferData(this._bufferType, data, this._drawType);
        }

        this._data = data;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    bind() {
        const gl = this._context;

        gl.bindBuffer(this._bufferType, this._buffer);
        gl.bufferData(this._bufferType, this._data, this._drawType);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    unbind() {
        const gl = this._context;

        gl.bindBuffer(this._bufferType, null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        const gl = this._context;

        gl.deleteBuffer(this._buffer);

        this._context = null;
        this._buffer = null;
        this._bufferType = null;
        this._drawType = null;
        this._data = null;
    }
}
