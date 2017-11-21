import Rectangle from '../math/Rectangle';
import Matrix from '../math/Matrix';

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

        /**
         * @private
         * @type {Boolean}
         */
        this._dirty = true;
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
     * @param {Number} x
     * @param {Number} y
     * @returns {Bounds}
     */
    addCoords(x, y) {
        this._minX = Math.min(this._minX, x);
        this._minY = Math.min(this._minY, y);
        this._maxX = Math.max(this._maxX, x);
        this._maxY = Math.max(this._maxY, y);

        this._dirty = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} rectangle
     * @param {Matrix} [transform]
     * @returns {Bounds}
     */
    addRect(rectangle, transform) {
        if (transform) {
            rectangle = rectangle.transform(transform, Rectangle.Temp);
        }

        return this
            .addCoords(rectangle.left, rectangle.top)
            .addCoords(rectangle.right, rectangle.bottom);
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getRect() {
        if (this._dirty) {
            this._rect.set(
                this._minX,
                this._minY,
                this._maxX - this._minX,
                this._maxY - this._minY
            );

            this._dirty = false;
        }

        return this._rect;
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

        this._dirty = true;

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

        this._dirty = null;
    }
}
