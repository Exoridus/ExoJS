/**
 * @interface Shape
 * @memberof Exo
 */
export default class Shape {

    /**
     * @public
     * @virtual
     * @readonly
     * @member {Number}
     */
    get type() {
        throw new Error('Type member should be overidden!');
    }

    /**
     * @public
     * @virtual
     * @readonly
     * @member {Exo.Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @virtual
     */
    set() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */
    copy(shape) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @returns {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape}
     */
    clone() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */
    toArray() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @returns {Exo.Rectangle}
     */
    getBounds() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @param {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape} shape
     * @returns {Boolean}
     */
    contains(shape) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     * @param {Exo.Vector|Exo.Circle|Exo.Rectangle|Exo.Polygon|Exo.Shape} shape
     * @returns {Boolean}
     */
    intersects(shape) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @virtual
     */
    destroy() {
        throw new Error('Method not implemented!');
    }
}
