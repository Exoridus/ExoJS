import {rangeIntersect} from '../utils';
import {SHAPE} from '../const';

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
     * @returns {Exo.Vector}
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
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    contains(x, y) {
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
     * @param {Exo.Shape} shape
     * @returns {Boolean}
     */
    collidesWith(shape) {
        switch (shape.type) {
            case SHAPE.POINT:
                return this.contains(shape.x, shape.y);
            case SHAPE.CIRCLE:
                return this._position.distanceTo(shape.position) < (this._radius + shape.radius);
            case SHAPE.RECTANGLE:
                return rangeIntersect(this.left, this.right, shape.left, shape.right) && rangeIntersect(this.top, this.bottom, shape.top, shape.bottom);
            case SHAPE.POLYGON:
            default:
                return false;
        }

        throw new Error('Passed item is not a valid shape!', shape);
    }

    /**
     * @public
     * @virtual
     */
    destroy() {
        throw new Error('Method not implemented!');
    }
}
