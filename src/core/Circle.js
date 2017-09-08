import Rectangle from './Rectangle';
import Vector from './Vector';
import Shape from './Shape';
import {SHAPE} from '../const';

/**
 * @class Circle
 * @implements {Exo.Shape}
 * @memberof Exo
 */
export default class Circle extends Shape {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [radius=0]
     */
    constructor(x = 0, y = 0, radius = 0) {
        super();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @private
         * @member {Number}
         */
        this._radius = radius;

        /**
         * @private
         * @member {Float32Array} _array
         */

        /**
         * @private
         * @member {Exo.Rectangle} _bounds
         */
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get type() {
        return SHAPE.CIRCLE;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get position() {
        return this._position;
    }

    set position(value) {
        this._position.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._position.x;
    }

    set x(value) {
        this._position.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._position.y;
    }

    set y(value) {
        this._position.y = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get radius() {
        return this._radius;
    }

    set radius(value) {
        this._radius = value;
    }

    /**
     * @public
     * @readonly
     * @member {Float32Array}
     */
    get array() {
        const array = this._array || (this._array = new Float32Array(3));

        array[0] = this.x;
        array[1] = this.y;
        array[2] = this.radius;

        return array;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
     */
    get bounds() {
        this.getBounds();
    }

    /**
     * @override
     */
    set(x, y, radius) {
        this._position.set(x, y);
        this._radius = radius;

        return this;
    }

    /**
     * @override
     */
    copy(circle) {
        this._position.copy(circle.position);
        this._radius = circle.radius;

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new Circle(this.x, this.y, this.radius);
    }

    /**
     * @override
     */
    reset() {
        this.set(0, 0, 0);
    }

    /**
     * @override
     */
    toArray() {
        return this.array;
    }

    /**
     * @override
     */
    getBounds() {
        if (!this._bounds) {
            this._bounds = new Rectangle();
        }

        return this._bounds.set(
            this._x - this._radius,
            this._y - this._radius,
            this._radius * 2,
            this._radius * 2,
        );
    }

    /**
     * @override
     */
    contains(shape) {
        switch (shape.type) {
            case SHAPE.POINT:
                const dx = (this.x - shape.x),
                    dy = (this.y - shape.y);

                return (dx * dx) + (dy * dy) <= (this._radius * this._radius);
            case SHAPE.CIRCLE:
            case SHAPE.RECTANGLE:
            case SHAPE.POLYGON:
            default:
                return false;
        }

        throw new Error('Passed item is not a valid shape!', shape);
    }

    /**
     * @override
     */
    intersects(shape) {
        switch (shape.type) {
            case SHAPE.POINT:
                return this.contains(shape);
            case SHAPE.CIRCLE:
                return this._position.distanceTo(shape.position) < (this._radius + shape.radius);
            case SHAPE.RECTANGLE:
            case SHAPE.POLYGON:
            default:
                return false;
        }

        throw new Error('Passed item is not a valid shape!', shape);
    }

    /**
     * @override
     */
    destroy() {
        if (this._array) {
            this._array = null;
        }

        if (this._bounds) {
            this._bounds.destroy();
            this._bounds = null;
        }

        this._position.destroy();
        this._position = null;
        this._radius = null;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Number}
     */
    distanceTo(circle) {
        const x = this._x - circle.x,
            y = this._y - circle.y;

        return Math.sqrt((x * x) + (y * y));
    }
}
