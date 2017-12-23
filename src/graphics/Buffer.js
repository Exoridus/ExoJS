import { EMPTY_ARRAY_BUFFER } from '../const/core';

/**
 * @class Buffer
 */
export default class Buffer {

    /**
     * Uploads the buffer to the GPU
     * @param data {ArrayBuffer| SharedArrayBuffer|ArrayBufferView} an array of data to upload
     * @param offset {Number} if only a subset of the data should be uploaded, this is the amount of data to subtract
     * @param dontBind {Boolean} whether to bind the buffer before uploading it
     */
    constructor(gl, type, data, drawType) {

        /**
         * The current WebGL rendering context
         *
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * The WebGL buffer, created upon instantiation
         *
         * @member {WebGLBuffer}
         */
        this._buffer = gl.createBuffer();

        /**
         * The type of the buffer
         *
         * @member {Number}
         */
        this._type = type || gl.ARRAY_BUFFER;

        /**
         * The draw type of the buffer
         *
         * @member {Number}
         */
        this.drawType = drawType || gl.STATIC_DRAW;

        /**
         * The data in the buffer, as a typed array
         *
         * @member {ArrayBuffer|SharedArrayBuffer|ArrayBufferView}
         */
        this._data = EMPTY_ARRAY_BUFFER;

        if (data) {
            this.upload(data);
        }
    }

    upload(data, offset = 0) {
        this.bind();

        const gl = this._context;

        if (this._data.byteLength >= data.byteLength) {
            gl.bufferSubData(this._type, offset, data);
        } else {
            gl.bufferData(this._type, data, this.drawType);
        }

        this._data = data;
    }

    bind() {
        this._context.bindBuffer(this._type, this._buffer);
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteBuffer(this._buffer);
    }

    static createVertexBuffer(gl, data, drawType) {
        return new Buffer(gl, gl.ARRAY_BUFFER, data, drawType);
    }

    static createIndexBuffer(gl, data, drawType) {
        return new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, data, drawType);
    }

    static create(gl, type, data, drawType) {
        return new Buffer(gl, type, data, drawType);
    }
}
