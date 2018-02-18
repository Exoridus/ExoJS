import Rectangle from '../types/Rectangle';
import Matrix from '../types/Matrix';
import Vector from '../types/Vector';

/**
 * @class Bounds
 */
export default class Bounds {

    /**
     * @constructor
     * @param {Number} [minX=Infinity]
     * @param {Number} [minY=Infinity]
     * @param {Number} [maxX=-Infinity]
     * @param {Number} [maxY=-Infinity]
     */
    constructor(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {

        /**
         * @private
         * @member {Vector}
         */
        this._min = new Vector(minX, minY);

        /**
         * @private
         * @member {Vector}
         */
        this._max = new Vector(maxX, maxY);

        /**
         * @private
         * @member {Rectangle}
         */
        this._rect = new Rectangle();

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = true;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get min() {
        return this._min;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get max() {
        return this._max;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [minX=Infinity]
     * @param {Number} [minY=Infinity]
     * @param {Number} [maxX=-Infinity]
     * @param {Number} [maxY=-Infinity]
     * @returns {Bounds}
     */
    reset(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
        this._min.set(minX, minY);
        this._max.set(maxX, maxY);
        this._dirty = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Bounds}
     */
    addPoint(x, y) {
        this._min.min(x, y);
        this._max.max(x, y);
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
            .addPoint(rectangle.left, rectangle.top)
            .addPoint(rectangle.right, rectangle.bottom);
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getRect() {
        if (this._dirty) {
            this._rect.set(
                this._min.x,
                this._min.y,
                this._max.x - this._min.x,
                this._max.y - this._min.y
            );

            this._dirty = false;
        }

        return this._rect;
    }

    /**
     * @public
     */
    destroy() {
        this._min.destroy();
        this._min = null;

        this._max.destroy();
        this._max = null;

        this._rect.destroy();
        this._rect = null;

        this._dirty = null;
    }
}
