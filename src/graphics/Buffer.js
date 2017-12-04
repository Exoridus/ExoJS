const EMPTY_VERTEX_DATA = new ArrayBuffer(0),
    EMPTY_INDEX_DATA = new Uint8Array(EMPTY_VERTEX_DATA);

/**
 * @class Buffer
 */
export default class Buffer {

    /**
     * @constructor
     */
    constructor(vertexData, indexData) {

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

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = vertexData || EMPTY_VERTEX_DATA;

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = indexData || EMPTY_INDEX_DATA;
    }

    /**
     * @override
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._vertexBuffer = gl.createBuffer();
            this._indexBuffer = gl.createBuffer();
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        this.unbindBuffers();

        if (this._context) {
            this._context.deleteBuffer(this._vertexBuffer);
            this._context.deleteBuffer(this._indexBuffer);

            this._vertexBuffer = null;
            this._indexBuffer = null;
            this._context = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    bindBuffers() {
        if (!this._context) {
            throw new Error('Buffer has to be connected first!')
        }

        const gl = this._context;

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);

        gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    unbindBuffers() {
        if (this._context) {
            const gl = this._context;

            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    uploadVertexData(vertexData, offset = 0) {
        const gl = this._context;

        if (this._vertexData.byteLength >= vertexData.byteLength) {
            gl.bufferSubData(gl.ARRAY_BUFFER, offset, vertexData);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
        }

        this._vertexData = vertexData;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Buffer}
     */
    uploadIndexData(indexData, offset = 0) {
        const gl = this._context;

        if (this._indexData.byteLength >= indexData.byteLength) {
            gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, offset, indexData);
        } else {
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);
        }

        this._indexData = indexData;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._vertexData = null;
        this._indexData = null;
    }
}
