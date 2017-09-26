import Rectangle from '../core/shape/Rectangle';
import Vector from '../core/Vector';

/**
 * @class Bounds
 */
export default class Bounds {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @type {Number}
         */
        this._minX = Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._minY = Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._maxX = -Infinity;

        /**
         * @private
         * @type {Number}
         */
        this._maxY = -Infinity;

        /**
         * @private
         * @type {?Rectangle}
         */
        this._rectangle = null;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get minX() {
        return this._minX;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get minY() {
        return this._minY;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get maxX() {
        return this._maxX;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get maxY() {
        return this._maxY;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get isEmpty() {
        return this._minX > this._maxX || this._minY > this._maxY;
    }

    /**
     * @public
     * @chainable
     * @param {Vector} point
     * @returns {Bounds}
     */
    addPoint(point) {
        this._minX = Math.min(this._minX, point.x);
        this._minY = Math.min(this._minY, point.y);
        this._maxX = Math.max(this._maxX, point.x);
        this._maxY = Math.max(this._maxY, point.y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} transform
     * @param {Rectangle} rectangle
     * @returns {Bounds}
     */
    addRectangle(transform, rectangle) {
        const vector = new Vector();

        this.addPoint(
            vector.set(rectangle.x, rectangle.y)
                .transform(transform),
        );

        this.addPoint(
            vector.set(rectangle.x, rectangle.height)
                .transform(transform)
        );

        this.addPoint(
            vector.set(rectangle.width, rectangle.y)
                .transform(transform)
        );

        this.addPoint(
            vector.set(rectangle.width,rectangle.height)
                .transform(transform)
        );

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Bounds} bounds
     * @returns {Bounds}
     */
    addBounds(bounds) {
        this._minX = Math.min(this._minX, bounds.minX);
        this._minY = Math.min(this._minY, bounds.minY);
        this._maxX = Math.max(this._maxX, bounds.maxX);
        this._maxY = Math.max(this._maxY, bounds.maxY);

        return this;
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getRect() {
        if (!this._rectangle) {
            this._rectangle = new Rectangle();
        }

        return this._rectangle.set(
            this._minX,
            this._minY,
            this._maxX - this._minX,
            this._maxY - this._minY,
        );
    }

    /**
     * @public
     * @chainable
     * @returns {Bounds}
     */
    reset() {
        this._minX = Infinity;
        this._minY = Infinity;
        this._maxX = -Infinity;
        this._maxY = -Infinity;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._rectangle) {
            this._rectangle.destroy();
            this._rectangle = null;
        }

        this._minX = null;
        this._minY = null;
        this._maxX = null;
        this._maxY = null;
    }
}
