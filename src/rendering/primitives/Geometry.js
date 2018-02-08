/**
 * @class Geometry
 */
export default class Geometry {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number[]} [options.points=[]]
     * @param {Number[]} [options.vertices=[]]
     * @param {Number[]} [options.indices=[]]
     */
    constructor({
        vertices = [],
        indices = [],
        points = [],
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
         * @member {Number[]}
         */
        this._points = points;
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
     * @member {Number[]}
     */
    get points() {
        return this._points;
    }

    /**
     * @public
     */
    destroy() {
        this._points.length = 0;
        this._points = null;

        this._vertices = null;
        this._indices = null;
    }
}
