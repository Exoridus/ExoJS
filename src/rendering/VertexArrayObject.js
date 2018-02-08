import { DRAW_MODES, SHADER_TYPES } from '../const/rendering';

/**
 * @class VertexArrayObject
 */
export default class VertexArrayObject {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} context
     * @param {Number} [drawMode=DRAW_MODES.TRIANGLES]
     */
    constructor(context, drawMode = DRAW_MODES.TRIANGLES) {

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
         * @member {Number}
         */
        this._drawMode = drawMode;

        /**
         * @member {Boolean}
         */
        this._dirty = false;
    }

    /**
     * Binds the buffer
     */
    bind() {
        const gl = this._context;

        this._context.bindVertexArray(this._vao);

        if (this._dirty) {
            let lastBuffer = null;

            for (const attribute of this._attributes) {
                if (lastBuffer !== attribute.buffer) {
                    attribute.buffer.bind();
                    lastBuffer = attribute.buffer;
                }

                gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
                gl.enableVertexAttribArray(attribute.location);
            }

            this._dirty = false;
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
     * @param {Buffer} buffer
     * @param {ShaderAttribute} attribute
     * @param {Number} [type=ATTRIBUTE_TYPES.FLOAT]
     * @param {Boolean} [normalized=false]
     * @param {Number} [stride=0]
     * @param {Number} [start=0]
     */
    addAttribute(buffer, attribute, type = SHADER_TYPES.FLOAT, normalized = false, stride = 0, start = 0) {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._dirty = true;

        return this;
    }

    /**
     * @param {Buffer} buffer
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
        this.unbind();

        this._attributes.length = 0;
        this._indexBuffer = null;

        return this;
    }

    /**
     * @param {Number} size
     * @param {Number} start
     * @param {Number} [type=this._drawMode]
     */
    draw(size, start, type = this._drawMode) {
        const gl = this._context;

        if (this._indexBuffer) {
            gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
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
