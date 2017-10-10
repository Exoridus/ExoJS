import { SHAPE } from '../../const';
import Vector from '../Vector';

/**
 * @abstract
 * @class Shape
 */
export default class Shape {

    /**
     * @constructor
     */
    constructor(x = 0, y = 0) {

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @private
         * @member {?Rectangle|?Bounds} _bounds
         */
        this._bounds = null;
    }

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
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    set position(position) {
        this._position.copy(position);
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._position.x;
    }

    set x(x) {
        this._position.x = x;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._position.y;
    }

    set y(y) {
        this._position.y = y;
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get bounds() {
        return this.getBounds();
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
     * @param {Shape|Rectangle|Circle|Polygon} shape
     */
    copy(shape) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {Shape|Rectangle|Circle|Polygon}
     */
    clone() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Rectangle|Circle|Polygon} shape
     */
    equals(shape) {
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
     * @param {Number} x
     * @param {Number} y
     * @param {Matrix} [transform]
     * @returns {Boolean}
     */
    contains(x, y, transform) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @param {Shape|Rectangle|Circle|Polygon} shape
     * @returns {?Collision}
     */
    checkCollision(shape) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */
    destroy() {
        if (this._bounds) {
            this._bounds.destroy();
            this._bounds = null;
        }

        this._position.destroy();
        this._position = null;
    }
}
