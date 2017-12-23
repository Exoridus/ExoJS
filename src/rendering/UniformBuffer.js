/**
 * @class UniformBufferObject
 */
export default class UniformBufferObject {

    /**
     * @constructor
     * @param context {WebGL2RenderingContext}
     */
    constructor(context) {

        /**
         * @member {WebGL2RenderingContext}
         */
        this._context = context;

        /**
         * @member {WebGLBuffer}
         */
        this._buffer = context.createBuffer();

        /**
         * @member {Array}
         */
        this._uniforms = [];

        /**
         * @member {Boolean}
         */
        this._dirty = false;
    }

    /**
     * Binds the buffer
     */
    bind() {
        this._context.bindVertexArray(this._vao);

        if (this._dirty) {
            this._dirty = false;
            this.activate();

            return this;
        }

        return this;
    }

    /**
     * Unbinds the buffer
     */
    unbind() {
        this._context.bindVertexArray(null);

        return this;
    }

    /**
     * Uses this vao
     */
    activate() {
        const gl = this._context;

        let lastBuffer = null;

        for (let i = 0; i < this._attributes.length; i++) {
            const attrib = this._attributes[i];

            if (lastBuffer !== attrib.buffer) {
                attrib.buffer.bind();
                lastBuffer = attrib.buffer;
            }

            gl.vertexAttribPointer(
                attrib.attribute.location,
                attrib.attribute.size,
                attrib.type || gl.FLOAT,
                attrib.normalized || false,
                attrib.stride || 0,
                attrib.start || 0
            );

            gl.enableVertexAttribArray(attrib.attribute.location);
        }

        return this;
    }

    /**
     * @param {Buffer} buffer
     * @param {ShaderBlock} uniformBlock
     * @param {Number} type
     * @param {Boolean} normalized
     * @param {Number} stride
     * @param {Number} start
     */
    addUniformBlock(buffer, uniformBlock, type, normalized, stride, start) {
        this._attributes.push({
            buffer: buffer,
            uniformBlock: uniformBlock,

            location: attribute.location,
            type: type || this._context.FLOAT,
            normalized: normalized || false,
            stride: stride || 0,
            start: start || 0
        });

        this._dirty = true;

        return this;
    }

    /**
     * Unbinds this vao and disables it
     */
    clear() {
        this._context.bindVertexArray(this._vao);

        this._attributes.length = 0;

        return this;
    }

    /**
     * Destroy this vao
     */
    destroy() {
        this._context.deleteVertexArray(this._vao);

        this._attributes = null;

        this._vao = null;
        this._context = null;
    }
}
