import { EMPTY_ARRAY_BUFFER } from '../const/core';

/**
 * @class Buffer
 */
export default class Buffer {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {Number} type
     * @param {ArrayBuffer|SharedArrayBuffer|ArrayBufferView} data
     * @param {Number} drawType
     */
    constructor(gl, type, data, drawType) {

        /**
         * The current WebGL rendering context
         *
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
        this._type = type;

        /**
         * @member {Number}
         */
        this.drawType = drawType;

        /**
         * @member {ArrayBuffer|SharedArrayBuffer|ArrayBufferView}
         */
        this._data = EMPTY_ARRAY_BUFFER;

        if (data) {
            this.upload(data);
        }
    }

    upload(data, offset = 0) {
        const gl = this._context;

        this.bind();

        if (this._data.byteLength >= data.byteLength) {
            gl.bufferSubData(this._type, offset, data);
        } else {
            gl.bufferData(this._type, data, this.drawType);
        }

        this._data = data;
    }

    bind() {
        const gl = this._context;

        gl.bindBuffer(this._type, this._buffer);
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteBuffer(this._buffer);
    }
}
