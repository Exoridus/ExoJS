import { SHAPE } from '../const';
import { inRange } from '../utils';
import Vector from './Vector';
import Shape from './Shape';
import Collision from './Collision';
import Size from './Size';

/**
 * @class Rectangle
 * @extends {Shape}
 */
export default class Rectangle extends Shape {

    /**
     * @constructs Rectangle
     * @param {Number} [x=0]
     * @param {Number} [y=x]
     * @param {Number} [width=0]
     * @param {Number} [height=width]
     */
    constructor(x = 0, y = x, width = 0, height = width) {
        super(x, y);

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(width, height);
    }

    /**
     * @override
     */
    get type() {
        return SHAPE.RECTANGLE;
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
        return (rectangle === this) || (this.position.equals(rectangle.position) && this._size.equals(rectangle.size));
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
