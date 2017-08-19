import Rectangle from './Rectangle';

/**
 * @class Circle
 * @memberof Exo
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
         * @public
         * @member {Number}
         */
        this._x = x;

        /**
         * @public
         * @member {Number}
         */
        this._y = y;

        /**
         * @public
         * @member {Number}
         */
        this._radius = radius;
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._x;
    }

    set x(value) {
        this._x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._y;
    }

    set y(value) {
        this._y = value;
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
     * @returns {Exo.Circle}
     */
    clone() {
        return new Circle(this.x, this.y, this.radius);
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Circle} circle
     * @returns {Exo.Circle}
     */
    copy(circle) {
        this.position.copy(circle.position);
        this.radius = circle.radius;

        return this;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    contains(x, y) {
        if (this.radius <= 0) {
            return false;
        }

        const dx = (this.x - x),
            dy = (this.y - y);

        return (dx * dx) + (dy * dy) <= (this.radius * this.radius);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Rectangle}
     */
    getBounds() {
        return new Rectangle(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    }
}
