/**
 * @class VertexArray
 */
export default class VertexArray {

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
         * @member {WebGLVertexArray}
         */
        this._vao = context.createVertexArray();

        /**
         * @member {Array}
         */
        this._attributes = [];

        /**
         * @member {PIXI.glCore.Buffer}
         */
        this._indexBuffer = null;

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

        if (this._indexBuffer) {
            this._indexBuffer.bind();
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
                attrib.start || 0);

            gl.enableVertexAttribArray(attrib.attribute.location);
        }

        if (this._indexBuffer) {
            this._indexBuffer.bind();
        }

        return this;
    }

    /**
     * @param buffer     {Buffer}
     * @param attribute  {*}
     * @param type       {Number}
     * @param normalized {Boolean}
     * @param stride     {Number}
     * @param start      {Number}
     */
    addAttribute(buffer, attribute, type, normalized, stride, start) {
        this._attributes.push({
            buffer: buffer,
            attribute: attribute,

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
     * @param buffer   {PIXI.gl.Buffer}
     */
    addIndex(buffer) {
        this._indexBuffer = buffer;
        this._dirty = true;

        return this;
    }

    /**
     * Unbinds this vao and disables it
     */
    clear() {
        this._context.bindVertexArray(this._vao);

        this._attributes.length = 0;
        this._indexBuffer = null;

        return this;
    }

    /**
     * @param {Number} type
     * @param {Number} size
     * @param {Number} start
     */
    draw(type, size, start) {
        const gl = this._context;

        if (this._indexBuffer) {
            gl.drawElements(type, size, gl.UNSIGNED_SHORT, (start || 0) * 2);
        } else {
            gl.drawArrays(type, start, size);
        }

        return this;
    }

    /**
     * Destroy this vao
     */
    destroy() {
        this._context.deleteVertexArray(this._vao);

        this._indexBuffer = null;
        this._attributes = null;

        this._vao = null;
        this._context = null;
    }
}
