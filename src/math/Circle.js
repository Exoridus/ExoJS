import Vector from './Vector';

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
        return new Circle(this.x, this.y, this._radius);
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
     * @override
     */
    contains(x, y, transform) {
        let position = this._position;

        if (transform) {
            position = position.transform(transform, Vector.Temp);
        }

        return position.distanceTo(x, y) <= this._radius;
    }

    /**
     * @override
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
