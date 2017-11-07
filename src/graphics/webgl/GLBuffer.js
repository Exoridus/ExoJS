/**
 * @class GLBuffer
 */
export default class GLBuffer {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {Number} size
     * @param {Number} attributeCount
     */
    constructor(context, size, attributeCount) {
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
        this._vertexBuffer = context.createBuffer();

        /**
         * @private
         * @member {WebGLBuffer}
         */
        this._indexBuffer = context.createBuffer();

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = this.createVertexBuffer(size, attributeCount);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = this.createIndexBuffer(size);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._uintView = new Uint32Array(this._vertexData);

        /**
         * @private
         * @member {Float32Array}
         */
        this._floatView = new Float32Array(this._vertexData);
    }

    /**
     * @public
     * @readonly
     * @member {Uint32Array}
     */
    get uintView() {
        return this._uintView;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get floatView() {
        return this._floatView;
    }

    /**
     * @public
     * @param {Number} size
     * @param {Number} attributeCount
     * @returns {ArrayBuffer}
     */
    createVertexBuffer(size, attributeCount) {
        return new ArrayBuffer(size * attributeCount * 4);
    }

    /**
     * @public
     * @param {Number} size
     * @returns {Uint16Array}
     */
    createIndexBuffer(size) {
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

    /**
     * @public
     * @chainable
     * @returns {GLBuffer}
     */
    bind() {
        const gl = this._context;

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GLBuffer}
     */
    unbind() {
        const gl = this._context;

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteBuffer(this._vertexBuffer);
        this._context.deleteBuffer(this._indexBuffer);

        this._context = null;
        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._vertexData = null;
        this._indexData = null;
        this._uintView = null;
        this._floatView = null;
    }
}
