/**
 * @class Face
 */
export default class Face {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {HalfEdge}
         */
        this._halfEdge = null;
    }

    /**
     * @public
     * @member {HalfEdge}
     */
    get halfEdge() {
        return this._halfEdge;
    }

    set halfEdge(halfEdge) {
        this._halfEdge = halfEdge;
    }

    /**
     * @public
     */
    destroy() {
        this._halfEdge = null;
    }
}