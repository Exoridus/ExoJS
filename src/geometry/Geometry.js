import { DRAW_MODES } from '../const';

/**
 * @class Geometry
 */
export default class Geometry {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number[]} [options.vertices=[]]
     * @param {Number[]} [options.indices=[]]
     * @param {Number} [options.drawMode=DRAW_MODES.TRIANGLES]
     */
    constructor({
        vertices = [],
        indices = [],
        drawMode = DRAW_MODES.TRIANGLES,
    } = {}) {

        /**
         * @private
         * @member {Vector[]}
         */
        this._vertices = vertices;

        /**
         * @private
         * @member {Number[]}
         */
        this._indices = indices;

        /**
         * @private
         * @member {Number}
         */
        this._drawMode = drawMode;
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
     * @readonly
     * @member {Number}
     */
    get drawMode() {
        return this._drawMode;
    }

    /**
     * @public
     */
    destroy() {
        this._vertices = null;
        this._indices = null;
        this._drawMode = null;
    }
}
