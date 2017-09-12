import ObservableVector from '../core/ObservableVector';
import Rectangle from '../core/shape/Rectangle';
import Matrix from '../core/Matrix';
import { DEG_TO_RAD } from '../const';

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
     * @member {Vector}
     */
    get center() {
        return this._center;
    }

    set center(value) {
        this._center.copy(value);
    }

    /**
     * @public
     * @member {Vector}
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
    get rotation() {
        return this._rotation;
    }

    set rotation(value) {
        this.setRotation(value);
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get viewport() {
        return this._viewport;
    }

    set viewport(value) {
        this._viewport.copy(value);
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

    set transform(value) {
        this._transform.copy(value);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    setCenter(x, y) {
        this._center.set(x, y);
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     */
    setSize(width, height) {
        this._size.set(width, height);
    }

    /**
     * @public
     * @param {Number} angle
     */
    setRotation(angle) {
        const rotation = angle % 360;

        this._rotation = (rotation < 0) ? rotation + 360 : rotation;
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @param {Rectangle} rectangle
     */
    setViewport(rectangle) {
        this._viewport.copy(rectangle);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    move(x, y) {
        this.setCenter(this._center.x + x, this._center.y + y);
    }

    /**
     * @public
     * @param {Number} factor
     */
    zoom(factor) {
        this.setSize(this._size.x * factor, this._size.y * factor);
    }

    /**
     * @public
     * @param {Number} angle
     */
    rotate(angle) {
        this.setRotation(this._rotation + angle);
    }

    /**
     * @public
     * @param {Rectangle} rectangle
     */
    reset(rectangle) {
        this._center.set(rectangle.x + (rectangle.width / 2) | 0, rectangle.y + (rectangle.height / 2) | 0);
        this._size.set(rectangle.width, rectangle.height);
        this._rotation = 0;
        this._dirtyTransform = true;
    }

    /**
     * @public
     */
    updateTransform() {
        const transform = this._transform,
            angle = this._rotation * DEG_TO_RAD,
            center = this._center,
            size = this._size,
            cos = Math.cos(angle),
            sin = Math.sin(angle),

            a = 2 / size.x,
            b = -2 / size.y,
            c = -a * center.x,
            d = -b * center.y,

            tx = (-center.x * cos) - (center.y * sin) + center.x,
            ty = (center.x * sin) - (center.y * cos) + center.y;

        transform.a = a * cos;
        transform.b = a * sin;
        transform.x = (a * tx) + c;

        transform.c = -b * sin;
        transform.d = b * cos;
        transform.y = (b * ty) + d;
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
        this._dirtyTransform = null;
    }

    /**
     * @private
     */
    _setDirty() {
        this._dirtyTransform = true;
    }
}
