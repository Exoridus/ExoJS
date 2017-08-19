/**
 * @class Polygon
 * @memberof Exo
 */
export default class Polygon {

    /**
     * @constructor
     * @param {Exo.Vector[]|Exo.Vector} vectors
     */
    constructor(...vectors) {

        /**
         * @private
         * @member {Exo.Vector[]}
         */
        this._vectors = vectors;
    }

    /**
     * @public
     * @returns {Exo.Polygon}
     */
    clone() {
        return new Polygon(this._vectors.map((vector) => vector.clone()));
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    contains(x, y) {
        const length = this.points.length / 2;
        let inside = false;

        for (let i = 0, j = length - 1; i < length; j = i++) {
            const xi = this.points[i * 2],
                yi = this.points[(i * 2) + 1],
                xj = this.points[j * 2],
                yj = this.points[(j * 2) + 1],
                intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * ((y - yi) / (yj - yi))) + xi);

            if (intersect) {
                inside = !inside;
            }
        }

        return inside;
    }
}
