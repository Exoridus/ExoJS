import { SHAPE } from '../../const';

/**
 * @abstract
 * @class Shape
 */
export default class Shape {

    /**
     * @private
     * @member {Float32Array} _array
     */

    /**
     * @private
     * @member {Rectangle} _bounds
     */

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Number}
     */
    get type() {
        return SHAPE.NONE;
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @abstract
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        return this.toArray();
    }

    /**
     * @public
     * @chainable
     * @abstract
     */
    set() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     */
    copy(shape) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Shape|Vector|Rectangle|Cirlce|Polygon}
     */
    clone() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */
    reset() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Float32Array}
     */
    toArray() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Rectangle}
     */
    getBounds() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     * @returns {Boolean}
     */
    contains(shape) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Vector|Rectangle|Cirlce|Polygon} shape
     * @returns {Boolean}
     */
    intersects(shape) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */
    destroy() {
        if (this._array) {
            this._array.fill(0);
            this._array = null;
        }

        if (this._bounds) {
            this._bounds.destroy();
            this._bounds = null;
        }
    }
}
