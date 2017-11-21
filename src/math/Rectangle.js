import { inRange } from '../utils';
import Vector from './Vector';
import Size from './Size';

/**
 * @class Rectangle
 */
export default class Rectangle {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=x]
     * @param {Number} [width=0]
     * @param {Number} [height=width]
     */
    constructor(x = 0, y = x, width = 0, height = width) {

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(width, height);
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
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size.copy(size);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this._size.width = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this._size.height = height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return this.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return this.y;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return this.x + this.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return this.y + this.height;
    }

    /**
     * @public
     * @chainable
     * @param {Matrix} matrix
     * @param {Rectangle} [result=this]
     * @returns {Rectangle}
     */
    transform(matrix, result = this) {
        const point = Vector.Temp;

        let minX, minY, maxX, maxY;

        point.set(this.left, this.top)
            .transform(matrix);

        minX = maxX = point.x;
        minY = maxY = point.y;

        point.set(this.left, this.bottom)
            .transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        point.set(this.right, this.top)
            .transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        point.set(this.right, this.bottom)
            .transform(matrix);

        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        return result.set(
            minX,
            minY,
            maxX - minX,
            maxY - minY
        );
    }

    /**
     * @override
     */
    set(x, y, width, height) {
        this._position.set(x, y);
        this._size.set(width, height);

        return this;
    }

    /**
     * @override
     */
    copy(rectangle) {
        this._position.copy(rectangle.position);
        this._size.copy(rectangle.size);

        return this;
    }

    /**
     * @override
     */
    clone() {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    /**
     * @public
     * @param {Rectangle|Object} rectangle
     * @param {Number} [rectangle.x]
     * @param {Number} [rectangle.y]
     * @param {Number} [rectangle.width]
     * @param {Number} [rectangle.height]
     * @returns {Boolean}
     */
    equals({ x, y, width, height } = {}) {
        return (x === undefined || this.x === x)
            && (y === undefined || this.y === y)
            && (width === undefined || this.width === width)
            && (height === undefined || this.height === height);
    }

    /**
     * @override
     */
    contains(x, y, transform) {
        let min = new Vector(this.left, this.top),
            max = new Vector(this.right, this.bottom);

        if (transform) {
            min.transform(transform);
            max.transform(transform);
        }

        return inRange(x, min.x, max.x)
            && inRange(y, min.y, max.y);
    }

    /**
     * @public
     * @param {Rectangle} rect
     * @returns {Boolean}
     */
    containsRect(rect) {
        return inRange(rect.left, this.left, this.right)
            && inRange(rect.right, this.left, this.right)
            && inRange(rect.top, this.top, this.bottom)
            && inRange(rect.bottom, this.top, this.bottom);
    }

    /**
     * @public
     * @param {Rectangle} rect
     * @returns {Boolean}
     */
    intersectsRect(rect) {
        if ((rect.left > this.right) || (rect.top > this.bottom)) {
            return false;
        }

        if ((this.left > rect.right) || (this.top > rect.bottom)) {
            return null;
        }

        return true;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Rectangle}
     */
    setPosition(x, y) {
        this.position.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Rectangle}
     */
    setSize(width, height) {
        this._size.set(width, height);

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._position.destroy();
        this._position = null;

        this._size.destroy();
        this._size = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @member {Rectangle}
 */
Rectangle.Empty = new Rectangle(0, 0, 0, 0);

/**
 * @public
 * @static
 * @constant
 * @member {Rectangle}
 */
Rectangle.Temp = new Rectangle();
