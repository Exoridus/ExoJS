import ObservableVector from '../core/ObservableVector';
import Rectangle from '../core/Rectangle';
import Matrix from '../core/Matrix';
import {DEG_TO_RAD} from '../const';

/**
 * @class View
 * @memberof Exo
 */
export default class View {

    /**
     * @constructor
     * @param {Exo.Rectangle} viewRectangle
     */
    constructor(viewRectangle) {

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._center = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._size = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._viewport = new Rectangle(0, 0, 1, 1);

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._transform = new Matrix();

        /**
         * @private
         * @member {Boolean}
         */
        this._dirtyTransform = true;

        this.reset(viewRectangle || new Rectangle(0, 0, 100, 100));
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
     * @member {Exo.Vector}
     */
    get center() {
        return this._center;
    }

    set center(value) {
        this._center.copy(value);
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
    get rotation() {
        return this._rotation;
    }

    set rotation(value) {
        this.setRotation(value);
    }

    /**
     * @public
     * @member {Exo.Rectangle}
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
     * @member {Exo.Matrix}
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
     * @param {Exo.Rectangle} rectangle
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
     * @param {Exo.Rectangle} rectangle
     */
    reset(rectangle) {
        this._center.set(rectangle.x + (rectangle.width / 2), rectangle.y + (rectangle.height / 2));
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
     * @private
     */
    _setDirty() {
        this._dirtyTransform = true;
    }
}
