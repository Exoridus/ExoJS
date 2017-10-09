import Vector from '../Vector';
import Shape from './Shape';
import { inRange, rangeIntersect } from '../../utils';
import { SHAPE } from '../../const';

/**
 * @class Rectangle
 * @extends {Shape}
 */
export default class Rectangle extends Shape {

    /**
     * @constructor
     * @param {Number} [x=0]
     * @param {Number} [y=x]
     * @param {Number} [width=0]
     * @param {Number} [height=width]
     */
    constructor(x = 0, y = x, width = 0, height = width) {
        super(x, y);

        /**
         * @public
         * @member {Vector}
         */
        this._size = new Vector(width, height);
    }

    /**
     * @override
     */
    get type() {
        return SHAPE.RECTANGLE;
    }

    /**
     * @public
     * @member {Vector}
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
        return this._size.x;
    }

    set width(width) {
        this._size.x = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(height) {
        this._size.y = height;
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
    get right() {
        return this.x + this.width;
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
    get bottom() {
        return this.y + this.height;
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
     * @override
     */
    reset() {
        return this.set(0, 0, 0, 0);
    }

    /**
     * @override
     */
    equals(rectangle) {
        return (this._position.equals(rectangle.position) && this._size.equals(rectangle.size));
    }

    /**
     * @override
     */
    toArray() {
        const array = this._array || (this._array = new Float32Array(4));

        array[0] = this.x;
        array[1] = this.y;
        array[2] = this.width;
        array[3] = this.height;

        return array;
    }

    /**
     * @override
     */
    getBounds() {
        if (!this._bounds) {
            this._bounds = new Rectangle();
        }

        return this._bounds.copy(this);
    }

    /**
     * @override
     */
    contains(x, y) {
        return (x >= Math.min(this.left, this.right))
            && (x < Math.max(this.left, this.right))
            && (y >= Math.min(this.top, this.bottom))
            && (y < Math.max(this.top, this.bottom));
    }

    /**
     * @override
     */
    intersects(rectangle) {
        return rangeIntersect(this.left, this.right, rectangle.left, rectangle.right)
            && rangeIntersect(this.top, this.bottom, rectangle.top, rectangle.bottom);
    }

    /**
     * @override
     */
    inside(rectangle) {
        return inRange(this.left, rectangle.left, rectangle.right)
            && inRange(this.right, rectangle.left, rectangle.right)
            && inRange(this.top, rectangle.top, rectangle.bottom)
            && inRange(this.bottom, rectangle.top, rectangle.bottom);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

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
