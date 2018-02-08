/**
 * @class MeshHalfEdge
 */
export default class MeshHalfEdge {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {MeshVertex}
         */
        this._vertex = null;

        /**
         * @private
         * @member {MeshFace}
         */
        this._face = null;

        /**
         * @private
         * @member {MeshHalfEdge}
         */
        this._next = null;

        /**
         * @private
         * @member {MeshHalfEdge}
         */
        this._prev = null;

        /**
         * @private
         * @member {MeshHalfEdge}
         */
        this._opposite = null;
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
     * @member {MeshHalfEdge}
     */
    get next() {
        return this._next;
    }

    set next(next) {
        this._next = next;
    }

    /**
     * @public
     * @member {MeshHalfEdge}
     */
    get prev() {
        return this._prev;
    }

    set prev(prev) {
        this._prev = prev;
    }

    /**
     * @public
     * @member {MeshHalfEdge}
     */
    get opposite() {
        return this._opposite;
    }

    set opposite(opposite) {
        this._opposite = opposite;
    }

    /**
     * @public
     */
    destroy() {
        this._vertex = null;
        this._face = null;
        this._next = null;
        this._prev = null;
        this._opposite = null;
    }
}
