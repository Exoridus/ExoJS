import ObservableVector from '../math/ObservableVector';
import Rectangle from '../math/Rectangle';
import Matrix from '../math/Matrix';
import { degreesToRadians } from '../utils';
import ObservableSize from '../math/ObservableSize';
import Bounds from '../core/Bounds';

/**
 * @class View
 */
export default class View {

    /**
     * @constructor
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} width
     * @param {Number} height
     */
    constructor(centerX, centerY, width, height) {

        /**
         * @private
         * @member {ObservableVector}
         */
        this._center = new ObservableVector(this._setDirty, this, centerX, centerY);

        /**
         * @private
         * @member {ObservableSize}
         */
        this._size = new ObservableSize(this._setDirty, this, width, height);

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
         * @member {Matrix}
         */
        this._inverseTransform = new Matrix();

        /**
         * @private
         * @member {Bounds}
         */
        this._bounds = new Bounds();

        /**
         * @private
         * @member {Boolean}
         */
        this._updateTransform = true;

        /**
         * @private
         * @member {Boolean}
         */
        this._updateInverseTransform = true;

        /**
         * @private
         * @member {Boolean}
         */
        this._updateBounds = true;

        /**
         * @private
         * @member {Number}
         */
        this._updateId = 0;
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
        this._setDirty();
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get updateId() {
        return this._updateId;
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
     * @param {Number} x
     * @param {Number} y
     * @returns {View}
     */
    move(x, y) {
        this.setCenter(this._center.x + x, this._center.y + y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} factor
     * @returns {View}
     */
    zoom(factor) {
        this.setSize(this._size.width * factor, this._size.height * factor);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} degrees
     * @returns {View}
     */
    rotate(degrees) {
        this.setRotation(this._rotation + degrees);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} centerX
     * @param {Number} centerY
     * @param {Number} width
     * @param {Number} height
     * @returns {View}
     */
    reset(centerX, centerY, width, height) {
        this._size.set(width, height);
        this._center.set(centerX, centerY);
        this._viewport.set(0, 0, 1, 1);
        this._rotation = 0;
        this._sin = 0;
        this._cos = 1;

        this._setDirty();

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getTransform() {
        if (this._updateTransform) {
            this.updateTransform();
            this._updateTransform = false;
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
            centerX = this._center.x,
            centerY = this._center.y,
            sin = this._sin,
            cos = this._cos,
            a =  2 / this._size.width,
            b = -2 / this._size.height,
            c = -a * centerX,
            d = -b * centerY,
            x = (-centerX * cos) - (centerY * sin) + centerX,
            y = (centerX * sin) - (centerY * cos) + centerY;

        transform.a = a * cos;
        transform.b = a * sin;
        transform.x = (a * x) + c;

        transform.c = -b * sin;
        transform.d =  b * cos;
        transform.y = (b * y) + d;

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getInverseTransform() {
        if (this._updateInverseTransform) {
            this.getTransform()
                .getInverse(this._inverseTransform);

            this._updateInverseTransform = false;
        }

        return this._inverseTransform;
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        if (this._updateBounds) {
            this.updateBounds();
            this._updateBounds = false;
        }

        return this._bounds.getRect();
    }

    /**
     * @public
     * @chainable
     * @returns {View}
     */
    updateBounds() {
        const offsetX = this.width / 2,
            offsetY = this.height / 2;

        this._bounds.reset()
            .addCoords(this._center.x - offsetX, this._center.y - offsetY)
            .addCoords(this._center.x + offsetX, this._center.y + offsetY);

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
        this.rotation = view.rotation;
        this.viewport = view.viewport;

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

        this._inverseTransform.destroy();
        this._inverseTransform = null;

        this._bounds.destroy();
        this._bounds = null;

        this._rotation = null;
        this._cos = null;
        this._sin = null;

        this._updateTransform = null;
        this._updateInverseTransform = null;
        this._updateBounds = null;
        this._updateId = null;
    }

    /**
     * @private
     */
    _setDirty() {
        this._updateTransform = true;
        this._updateInverseTransform = true;
        this._updateBounds = true;
        this._updateId++;
    }
}
