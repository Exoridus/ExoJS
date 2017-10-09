import Rectangle from './Rectangle';
import Vector from '../Vector';
import Shape from './Shape';
import { SHAPE } from '../../const';

/**
 * @class Circle
 * @extends {Shape}
 */
export default class Circle extends Shape {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [radius=0]
     */
    constructor(x = 0, y = 0, radius = 0) {
        super(x, y);

        /**
         * @private
         * @member {Number}
         */
        this._radius = radius;
    }

    /**
     * @override
     */
    get type() {
        return SHAPE.CIRCLE;
    }

    /**
     * @public
     * @member {Number}
     */
    get radius() {
        return this._radius;
    }

    set radius(radius) {
        this._radius = radius;
    }

    /**
     * @override
     */
    set(x, y, radius) {
        this.position.set(x, y);
        this._radius = radius;

        return this;
    }

    /**
     * @override
     */
    copy(circle) {
        this.position.copy(circle.position);
        this._radius = circle.radius;

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new Circle(this.x, this.y, this._radius);
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
    equals(circle) {
        return (this.position.equals(circle.position) && this._radius === circle.radius);
    }

    /**
     * @override
     */
    toArray() {
        const array = this._array || (this._array = new Float32Array(3));

        array[0] = this.x;
        array[1] = this.y;
        array[2] = this.radius;

        return array;
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
            this._radius * 2
        );
    }

    /**
     * @override
     */
    contains(x, y) {
        return this.position.distanceTo(x, y) < this._radius;
    }

    /**
     * @override
     */
    intersects(circle) {
        return this.position.distanceTo(circle.x, circle.y) < (this._radius + circle.radius);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._radius = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @member {Circle}
 */
Circle.Empty = new Circle(0, 0, 0);

/**
 * @public
 * @static
 * @constant
 * @member {Circle}
 */
Circle.Temp = new Circle();
