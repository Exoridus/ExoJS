import Rectangle from '../core/shape/Rectangle';
import Vector from '../core/Vector';
import Matrix from '../core/Matrix';

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
         * @type {Rectangle}
         */
        this._rect = new Rectangle();
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
     * @param {Rectangle} rect
     * @param {Matrix} [transform]
     * @returns {Bounds}
     */
    addRect(rect, transform) {
        const temp = Rectangle.Temp.copy(rect);

        if (transform) {
            transform.transformRect(temp);
        }

        return this
            .addPoint(temp.position)
            .addPoint(temp.position.add(temp.width, temp.height));
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getRect() {
        return this._rect.set(
            this._minX,
            this._minY,
            this._maxX - this._minX,
            this._maxY - this._minY
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
        this._rect.destroy();
        this._rect = null;

        this._minX = null;
        this._minY = null;
        this._maxX = null;
        this._maxY = null;
    }
}
