import ObservableVector from '../math/ObservableVector';
import Rectangle from '../math/Rectangle';
import Matrix from '../math/Matrix';
import { degreesToRadians } from '../utils';
import ObservableSize from '../math/ObservableSize';
import Vector from '../math/Vector';

/**
 * @class View
 */
export default class View {

    /**
     * @constructs View
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
         * @member {ObservableSize}
         */
        this._size = new ObservableSize(this._onChangeSize, this);

        /**
         * @private
         * @member {Vector}
         */
        this._offsetCenter = new Vector();

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
     * @member {ObservableVector}
     */
    get center() {
        return this._center;
    }

    set center(center) {
        this._center.copy(center);
    }

    /**
     * @public
     * @member {ObservableSize}
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

    set rotation(degrees) {
        const trimmed = degrees % 360,
            rotation = trimmed < 0 ? trimmed + 360 : trimmed,
            radians = degreesToRadians(rotation);

        this._rotation = (rotation < 0) ? rotation + 360 : rotation;
        this._cos = Math.cos(radians);
        this._sin = Math.sin(radians);

        this._setDirty();
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
        return this.getTransform();
    }

    set transform(transform) {
        this._transform.copy(transform);
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get offsetCenter() {
        return this._offsetCenter;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get left() {
        return (this._center.x - this._offsetCenter.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get top() {
        return (this._center.y - this._offsetCenter.y);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get right() {
        return (this._center.x + this._offsetCenter.x);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bottom() {
        return (this._center.y + this._offsetCenter.y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {View}
     */
    move(x, y) {
        this._center.add(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} factor
     * @returns {View}
     */
    zoom(factor) {
        this._size.multiply(factor);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} degrees
     * @returns {View}
     */
    rotate(degrees) {
        this.rotation += degrees;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} rectangle
     * @returns {View}
     */
    reset(rectangle) {
        this._size.copy(rectangle.size);
        this._center.set(
            (rectangle.x + this._offsetCenter.x),
            (rectangle.y + this._offsetCenter.y)
        );
        this._rotation = 0;
        this._cos = 1;
        this._sin = 0;

        this._setDirty();

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getTransform() {
        if (this._dirtyTransform) {
            this.updateTransform();
            this._dirtyTransform = false;
        }

        return this._transform;
    }

    /**
     * @public
     * @chainable
     * @returns {View}
     */
    updateTransform() {
        const transform = this._transform,
            center = this._center,
            a = 2 / this._size.width,
            b = -2 / this._size.height,
            c = (center.x * -a),
            d = (center.y * -b),
            x = (center.x * -this._cos) - (center.y * this._sin) + center.x,
            y = (center.x * this._sin) - (center.y * this._cos) + center.y;

        transform.a = (a * this._cos);
        transform.b = (a * this._sin);

        transform.c = (b * -this._sin);
        transform.d = (b * this._cos);

        transform.x = (a * x) + c;
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

        this._offsetCenter.destroy();
        this._offsetCenter = null;

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

    /**
     * @private
     */
    _onChangeSize() {
        this._offsetCenter.set(this._size.width / 2 | 0, this._size.height / 2 | 0);
        this._setDirty();
    }
}
