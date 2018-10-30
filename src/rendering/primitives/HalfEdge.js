/**
 * @class HalfEdge
 */
export default class HalfEdge {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Vertex}
         */
        this._vertex = null;

        /**
         * @private
         * @member {Face}
         */
        this._face = null;

        /**
         * @private
         * @member {HalfEdge}
         */
        this._next = null;

        /**
         * @private
         * @member {HalfEdge}
         */
        this._opposite = null;

        /**
         * @private
         * @member {HalfEdge}
         */
        this._prev = null;
    }

    /**
     * @public
     * @member {Vertex}
     */
    get vertex() {
        return this._vertex;
    }

    set vertex(vertex) {
        this._vertex = vertex;
    }

    /**
     * @public
     * @member {Face}
     */
    get face() {
        return this._face;
    }

    set face(face) {
        this._face = face;
    }

    /**
     * @public
     * @member {HalfEdge}
     */
    get next() {
        return this._next;
    }

    set next(next) {
        this._next = next;
    }

    /**
     * @public
     * @member {HalfEdge}
     */
    get opposite() {
        return this._opposite;
    }

    set opposite(opposite) {
        this._opposite = opposite;
    }

    /**
     * @public
     * @member {HalfEdge}
     */
    get prev() {
        return this._prev;
    }

    set prev(prev) {
        this._prev = prev;
    }

    /**
     * @public
     */
    destroy() {
        this._vertex = null;
        this._face = null;
        this._next = null;
        this._opposite = null;
        this._prev = null;
    }
}
