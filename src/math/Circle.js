import Vector from './Vector';
import Rectangle from './Rectangle';
import Polygon from './Polygon';
import Collision from '../core/Collision';
import Interval from './Interval';

/**
 * @class Circle
 */
export default class Circle {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=0]
     * @param {Number} [radius=0]
     */
    constructor(x = 0, y = 0, radius = 0) {

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @private
         * @member {Number}
         */
        this._radius = radius;
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
     * @member {Number}
     */
    get radius() {
        return this._radius;
    }

    set radius(radius) {
        this._radius = radius;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Circle}
     */
    setPosition(x, y) {
        this._position.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} radius
     * @returns {Circle}
     */
    setRadius(radius) {
        this._radius = radius;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radius
     * @returns {Circle}
     */
    set(x, y, radius) {
        this._position.set(x, y);
        this._radius = radius;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Circle} circle
     * @returns {Circle}
     */
    copy(circle) {
        this._position.copy(circle.position);
        this._radius = circle.radius;

        return this;
    }

    /**
     * @public
     * @returns {Circle}
     */
    clone() {
        return new Circle(this.x, this.y, this.radius);
    }

    /**
     * @public
     * @param {Circle|Object} circle
     * @param {Number} [circle.x]
     * @param {Number} [circle.y]
     * @param {Number} [circle.radius]
     * @returns {Boolean}
     */
    equals({ x, y, radius } = {}) {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (radius === undefined || this.radius === radius);
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        return new Rectangle(
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
    }

    /**
     * todo - cache this
     *
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        return [];
    }

    /**
     * @public
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        return result.set(0, 0);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @param {Matrix} [transform]
     * @returns {Boolean}
     */
    contains(x, y, transform) {
        let position = this._position;

        if (transform) {
            position = position.transform(transform, Vector.Temp);
        }

        return (position.distanceTo(x, y) <= this._radius);
    }

    /**
     * @public
     * @param {Circle|Rectangle|Polygon} object
     * @returns {Boolean}
     */
    intersets(object) {
        if (object instanceof Circle) {
            return Collision.intersectionCircleCircle(this, object);
        }

        if (object instanceof Rectangle) {
            return Collision.intersectionCircleRect(this, object);
        }

        if (object instanceof Polygon) {
            return Collision.intersectionPolyCircle(object, this);
        }

        return false;
    }

    /**
     * @public
     * @param {Circle|Rectangle|Polygon} object
     * @returns {?Collision}
     */
    getCollision(object) {
        if (object instanceof Circle) {
            return Collision.collisionCircleCircle(this, object);
        }

        if (object instanceof Rectangle) {
            return Collision.collisionCircleRect(this, object);
        }

        if (object instanceof Polygon) {
            return Collision.collisionPolyCircle(object, this, true);
        }

        return null;
    }

    /**
     * @public
     */
    destroy() {
        this._position.destroy();
        this._position = null;

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
