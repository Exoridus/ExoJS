import Vector from './Vector';
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
     * @param {Number} [y=0]
     * @param {Number} [width=1]
     * @param {Number} [height=1]
     */
    constructor(x = 0, y = 0, width = 1, height = 1) {
        super();

        /**
         * @public
         * @member {Vector}
         */
        this._position = new Vector(x, y);

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
     * @member {Number}
     */
    get left() {
        return this.x;
    }

    set left(left) {
        this.x = left;
    }

    /**
     * @public
     * @member {Number}
     */
    get right() {
        return this.x + this.width;
    }

    set right(right) {
        this.x = right - this.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get top() {
        return this.y;
    }

    set top(top) {
        this.y = top;
    }

    /**
     * @public
     * @member {Number}
     */
    get bottom() {
        return this.y + this.height;
    }

    set bottom(bottom) {
        this.y = bottom - this.height;
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
        this.set(0, 0, 1, 1);
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
    contains(shape) {
        switch (shape.type) {
            case SHAPE.POINT:
                return inRange(shape.x, this.left, this.right) && inRange(shape.y, this.top, this.bottom);
            case SHAPE.CIRCLE:
                return this.contains(shape.bounds);
            case SHAPE.RECTANGLE:
                return inRange(shape.left, this.left, this.right)
                    && inRange(shape.right, this.left, this.right)
                    && inRange(shape.top, this.top, this.bottom)
                    && inRange(shape.bottom, this.top, this.bottom);
            case SHAPE.POLYGON:
                return false;
            default:
                throw new Error('Passed item is not a valid shape!', shape);
        }
    }

    /**
     * @override
     */
    intersects(shape) {
        switch (shape.type) {
            case SHAPE.POINT:
                return this.contains(shape);
            case SHAPE.CIRCLE:
                return this.intersects(shape.bounds);
            case SHAPE.RECTANGLE:
                return rangeIntersect(this.left, this.right, shape.left, shape.right)
                    && rangeIntersect(this.top, this.bottom, shape.top, shape.bottom);
            case SHAPE.POLYGON:
                return false;
            default:
                throw new Error('Passed item is not a valid shape!', shape);
        }

    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._position.destroy();
        this._position = null;

        this._size.destroy();
        this._size = null;
    }
}
