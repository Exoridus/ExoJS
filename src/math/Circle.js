import { SHAPE } from '../const';
import Rectangle from './Rectangle';
import Shape from './Shape';
import Collision from './Collision';
import Vector from './Vector';

/**
 * @class Circle
 * @extends {Shape}
 */
export default class Circle extends Shape {

    /**
     * @constructs Circle
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
    equals(circle) {
        return circle === this || (this.position.equals(circle.position) && this._radius === circle.radius);
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
    contains(x, y, transform) {
        let position = this.position;

        if (transform) {
            position = position.transform(transform, Vector.Temp);
        }

        return position.distanceTo(x, y) <= this._radius;
    }

    /**
     * @override
     */
    getCollision(shape) {
        switch (shape.type) {
            case SHAPE.RECTANGLE:
                return Collision.checkCircleRectangle(this, shape);
            case SHAPE.CIRCLE:
                return Collision.checkCircleCircle(this, shape);
            case SHAPE.POLYGON:
                return Collision.checkPolygonCircle(shape, this);
            case SHAPE.NONE:
            default:
                throw new Error(`Invalid Shape Type "${shape.type}".`);
        }
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
