import ObservableVector from '../math/ObservableVector';
import Rectangle from '../math/Rectangle';
import Matrix from '../math/Matrix';
import { degreesToRadians } from '../utils/math';
import ObservableSize from '../math/ObservableSize';
import Bounds from '../core/Bounds';
import { FLAGS } from '../const/core';
import Flags from '../math/Flags';

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
        this._center = new ObservableVector(this._setPositionDirty, this, centerX, centerY);

        /**
         * @private
         * @member {ObservableSize}
         */
        this._size = new ObservableSize(this._setScalingDirty, this, width, height);

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
         * @member {Flags}
         */
        this._flags = new Flags(FLAGS.TRANSFORM | FLAGS.TRANSFORM_INV | FLAGS.BOUNDING_BOX);

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
        if (!this._viewport.equals(viewport)) {
            this._viewport.copy(viewport);
            this._transformId++;
        }
    }

    /**
     * @public
     * @readonly
     * @member {Flags}
     */
    get flags() {
        return this._flags;
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
    resize(width, height) {
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
            rotation = trimmed < 0 ? trimmed + 360 : trimmed;

        if (this._rotation !== rotation) {
            this._rotation = rotation;
            this._setRotationDirty();
        }

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
        this.resize(this._size.width * factor, this._size.height * factor);

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

        this._flags.add(FLAGS.TRANSFORM);

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getTransform() {
        if (this._flags.has(FLAGS.TRANSFORM)) {
            this.updateTransform();
            this._flags.remove(FLAGS.TRANSFORM);
        }

        return this._transform;
    }

    /**
     * @public
     * @chainable
     * @returns {View}
     */
    updateTransform() {
        const x = 2 / this.width,
            y = -2 / this.height;

        if (this._flags.has(FLAGS.ROTATION)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this._flags.has(FLAGS.ROTATION | FLAGS.SCALING)) {
            this._transform.a = x * this._cos;
            this._transform.b = x * this._sin;

            this._transform.c = -y * this._sin;
            this._transform.d =  y * this._cos;
        }

        this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + (-x * this._center.x);
        this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + (-y * this._center.y);

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getInverseTransform() {
        if (this._flags.has(FLAGS.TRANSFORM_INV)) {
            this.getTransform()
                .getInverse(this._inverseTransform);

            this._flags.remove(FLAGS.TRANSFORM_INV);
        }

        return this._inverseTransform;
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        if (this._flags.has(FLAGS.BOUNDING_BOX)) {
            this.updateBounds();
            this._flags.remove(FLAGS.BOUNDING_BOX);
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

        this._flags.destroy();
        this._flags = null;

        this._rotation = null;
        this._cos = null;
        this._sin = null;

        this._updateId = null;
    }

    /**
     * @private
     */
    _setDirty() {
        this._flags.add(FLAGS.TRANSFORM_INV | FLAGS.BOUNDING_BOX);
        this._updateId++;
    }

    /**
     * @private
     */
    _setPositionDirty() {
        this._flags.add(FLAGS.TRANSLATION);
        this._setDirty();
    }

    /**
     * @private
     */
    _setRotationDirty() {
        this._flags.add(FLAGS.ROTATION);
        this._setDirty();
    }

    /**
     * @private
     */
    _setScalingDirty() {
        this._flags.add(FLAGS.SCALING);
        this._setDirty();
    }
}
