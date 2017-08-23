import Vector from './Vector';
import Shape from './Shape';
import {inRange} from '../utils';
import {SHAPE} from '../const';

/**
 * @class Rectangle
 * @implements {Exo.Shape}
 * @memberof Exo
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
         * @member {Exo.Vector}
         */
        this._position = new Vector(x, y);

        /**
         * @public
         * @member {Exo.Vector}
         */
        this._size = new Vector(width, height);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get type() {
        return SHAPE.RECTANGLE;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get position() {
        return this._position;
    }

    set position(value) {
        this._position.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get x() {
        return this._position.x;
    }

    set x(value) {
        this._position.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get y() {
        return this._position.y;
    }

    set y(value) {
        this._position.y = value;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(value) {
        this._size.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(value) {
        this._size.y = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get left() {
        return this.x;
    }

    set left(value) {
        this.x = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get right() {
        return this.x + this.width;
    }

    set right(value) {
        this.x = value - this.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get top() {
        return this.y;
    }

    set top(value) {
        this.y = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get bottom() {
        return this.y + this.height;
    }

    set bottom(value) {
        this.y = value - this.height;
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
    toArray() {
        return [
            this.x,
            this.y,
            this.width,
            this.height,
        ];
    }

    /**
     * @override
     */
    contains(x, y) {
        return inRange(x, this.left, this.right) && inRange(y, this.top, this.bottom);
    }

    /**
     * @override
     */
    getBounds() {
        return this.clone();
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

    /**
     * @public
     * @static
     * @returns {Exo.Rectangle}
     */
    static get Empty() {
        return new Rectangle(0, 0, 0, 0);
    }
}
