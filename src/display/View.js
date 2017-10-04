import ObservableVector from '../core/ObservableVector';
import Rectangle from '../core/shape/Rectangle';
import Matrix from '../core/Matrix';
import { degreesToRadians } from '../utils';
import Bounds from './Bounds';

/**
 * @class View
 */
export default class View {

    /**
     * @constructor
     * @param {Rectangle} viewRectangle
     */
    constructor(viewRectangle = new Rectangle(0, 0, 100, 100)) {

        /**
         * @private
         * @member {ObservableVector}
         */
        this._center = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._size = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Number}
         */
        this._sin = 0;

        /**
         * @private
         * @member {Number}
         */
        this._cos = 1;

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new Rectangle(0, 0, 1, 1);

        /**
         * @private
         * @member {Matrix}
         */
        this._transform = new Matrix();

        /**
         * @private
         * @member {Boolean}
         */
        this._dirtyTransform = true;

        this.reset(viewRectangle);
    }

    /**
     * @public
     * @member {Vector}
     */
    get center() {
        return this._center;
    }

    set center(center) {
        this._center.copy(center);
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
    get rotation() {
        return this._rotation;
    }

    set rotation(rotation) {
        this.setRotation(rotation);
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get viewport() {
        return this._viewport;
    }

    set viewport(viewport) {
        this._viewport.copy(viewport);
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @member {Matrix}
     */
    get transform() {
        if (this._dirtyTransform) {
            this.updateTransform();
            this._dirtyTransform = false;
        }

        return this._transform;
    }

    set transform(transform) {
        this._transform.copy(transform);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return this._center.x - (this._size.x / 2);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return this._center.y - (this._size.y / 2);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return this._center.x + (this._size.x / 2);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return this._center.y + (this._size.y / 2);
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {View}
     */
    setCenter(x, y) {
        this._center.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {View}
     */
    setSize(width, height) {
        this._size.set(width, height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} degrees
     * @returns {View}
     */
    setRotation(degrees) {
        const trimmed = degrees % 360,
            rotation = trimmed < 0 ? trimmed + 360 : trimmed,
            radians = degreesToRadians(rotation);

        this._rotation = (rotation < 0) ? rotation + 360 : rotation;
        this._cos = Math.cos(radians);
        this._sin = Math.sin(radians);

        this._setDirty();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} rectangle
     * @returns {View}
     */
    setViewport(rectangle) {
        this._viewport.copy(rectangle);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {View}
     */
    move(x, y) {
        return this.setCenter(this._center.x + x, this._center.y + y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} factor
     * @returns {View}
     */
    zoom(factor) {
        return this.setSize(this._size.x * factor, this._size.y * factor);
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {View}
     */
    rotate(angle) {
        return this.setRotation(this._rotation + angle);
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} rectangle
     * @returns {View}
     */
    reset(rectangle) {
        this._center.set(rectangle.x + (rectangle.width / 2) | 0, rectangle.y + (rectangle.height / 2) | 0);
        this._size.set(rectangle.width, rectangle.height);
        this._rotation = 0;
        this._cos = 1;
        this._sin = 0;

        this._setDirty();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {View}
     */
    updateTransform() {
        const transform = this._transform,
            center = this._center,
            size = this._size,

            a = 2 / size.x,
            b = -2 / size.y,
            x = (-center.x * this._cos) - (center.y * this._sin) + center.x,

            c = -a * center.x,
            d = -b * center.y,
            y = (center.x * this._sin) - (center.y * this._cos) + center.y;

        transform.a = a * this._cos;
        transform.b = a * this._sin;
        transform.x = (a * x) + c;

        transform.c = -b * this._sin;
        transform.d = b * this._cos;
        transform.y = (b * y) + d;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {View} view
     * @returns {View}
     */
    copy(view) {
        this.center = view.center;
        this.size = view.size;
        this.viewport = view.viewport;
        this.transform = view.transform;
        this.rotation = view.rotation;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._center.destroy();
        this._center = null;

        this._size.destroy();
        this._size = null;

        this._viewport.destroy();
        this._viewport = null;

        this._transform.destroy();
        this._transform = null;

        this._rotation = null;
        this._cos = null;
        this._sin = null;

        this._dirtyTransform = null;
    }

    /**
     * @private
     */
    _setDirty() {
        this._dirtyTransform = true;
    }
}
