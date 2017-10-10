import Vector from './Vector';
import Shape from './Shape';
import Collision from './Collision';
import { inRange } from '../utils';
import { SHAPE } from '../const';

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
     * @returns {Rectangle}
     */
    transform(matrix) {
        matrix.transformRect(this);

        return this;
    }

    /**
     * @override
     */
    set(x, y, width, height) {
        this.position.set(x, y);
        this._size.set(width, height);

        return this;
    }

    /**
     * @override
     */
    copy(rectangle) {
        this.position.copy(rectangle.position);
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
    equals(rectangle) {
        return rectangle === this || (this.position.equals(rectangle.position) && this._size.equals(rectangle.size));
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
    contains(x, y, transform) {
        let min = new Vector(this.left, this.top),
            max = new Vector(this.right, this.bottom);

        if (transform) {
            min = transform.transformPoint(min);
            max = transform.transformPoint(max);
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
     * @override
     */
    getCollision(shape) {
        switch (shape.type) {
            case SHAPE.RECTANGLE:
                return Collision.checkRectangleRectangle(this, shape);
            case SHAPE.CIRCLE:
                return Collision.checkCircleRectangle(shape, this);
            case SHAPE.POLYGON:
                return Collision.checkPolygonRectangle(shape, this);
            case SHAPE.NONE:
            default:
                throw new Error(`Invalid Shape Type "${shape.type}".`);
        }
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
