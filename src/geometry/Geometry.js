import VertexArray from '../display/VertexArray';
import Buffer from '../display/Buffer';
import { TYPES } from '../const';

/**
 * @class Geometry
 */
export default class Geometry {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number[]} [options.vertices=[]]
     * @param {Number[]} [options.indices=[]]
     */
    constructor({
        vertices = [],
        indices = [],
    } = {}) {

        /**
         * @private
         * @member {Float32Array}
         */
        this._vertices = new Float32Array(vertices);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indices = new Uint16Array(indices);

        /**
         * @private
         * @member {?VertexArray}
         */
        this._vao = null;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get vertices() {
        return this._vertices;
    }

    /**
     * @public
     * @readonly
     * @member {Uint16Array}
     */
    get indices() {
        return this._indices;
    }

    /**
     * @public
     * @param {WebGL2RenderingContext} gl
     * @param {Shader} shader
     */
    getVAO(gl, shader) {
        if (!this._vao) {
            const vertexBuffer = Buffer.createVertexBuffer(gl,this._vertices),
                indexBuffer = Buffer.createIndexBuffer(gl, this._indices);

            this._vao = new VertexArray(gl)
                .addAttribute(vertexBuffer, 0, TYPES.FLOAT, 2, false, 12, 0)
                .addAttribute(vertexBuffer, 1, TYPES.UNSIGNED_BYTE, 4, true, 12, 8)
                .addIndex(indexBuffer);
        }

        return this._vao;
    }

    /**
     * @public
     */
    destroy() {
        if (this._vao) {
            this._vao.destroy();
            this._vao = null;
        }

        this._vertices = null;
        this._indices = null;
    }
}
