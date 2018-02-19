import { DRAW_MODES, TYPES } from '../const';

/**
 * @class VertexArray
 */
export default class VertexArray {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     */
    constructor(gl) {

        /**
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @member {WebGLVertexArray}
         */
        this._vao = gl.createVertexArray();

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
     * @public
     * @chainable
     * @returns {VertexArray}
     */
    bind() {
        const gl = this._context;

        gl.bindVertexArray(this._vao);

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
     * @public
     * @chainable
     * @returns {VertexArray}
     */
    unbind() {
        this._context.bindVertexArray(null);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Buffer} buffer
     * @param {ShaderAttribute} attribute
     * @param {Number} [type=TYPES.FLOAT]
     * @param {Boolean} [normalized=false]
     * @param {Number} [stride=0]
     * @param {Number} [start=0]
     * @returns {VertexArray}
     */
    addAttribute(buffer, attribute, type = TYPES.FLOAT, normalized = false, stride = 0, start = 0) {
        const { location, size } = attribute;

        this._attributes.push({ buffer, location, size, type, normalized, stride, start });
        this._dirty = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Buffer} buffer
     * @returns {VertexArray}
     */
    addIndex(buffer) {
        this._indexBuffer = buffer;
        this._dirty = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {VertexArray}
     */
    clear() {
        this._attributes.length = 0;
        this._indexBuffer = null;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} size
     * @param {Number} start
     * @param {Number} [drawMode=DRAW_MODES.TRIANGLES]
     * @returns {VertexArray}
     */
    draw(size, start, drawMode = DRAW_MODES.TRIANGLES) {
        const gl = this._context;

        if (this._indexBuffer) {
            gl.drawElements(drawMode, size, gl.UNSIGNED_SHORT, start);
        } else {
            gl.drawArrays(drawMode, start, size);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteVertexArray(this._vao);

        this._vao = null;
        this._context = null;
        this._attributes = null;
        this._indexBuffer = null;
    }
}
