import EventEmitter from './EventEmitter';
import ObservableVector from './ObservableVector';
import Matrix from './Matrix';
import { degreesToRadians } from '../utils';

/**
 * @class Transformable
 * @extends {EventEmitter}
 */
export default class Transformable extends EventEmitter {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Matrix}
         */
        this._transform = new Matrix();

        /**
         * @private
         * @member {ObservableVector}
         */
        this._position = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._scale = new ObservableVector(this._setDirty, this, 1, 1);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._origin = new ObservableVector(this._setDirty, this);

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
         * @member {Boolean}
         */
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @member {ObservableVector}
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
     * @member {ObservableVector}
     */
    get scale() {
        return this._scale;
    }

    set scale(scale) {
        this._scale.copy(scale);
    }

    /**
     * @public
     * @member {ObservableVector}
     */
    get origin() {
        return this._origin;
    }

    set origin(origin) {
        this._origin.copy(origin);
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
     * @chainable
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
     * @returns {Transformable}
     */
    updateTransform() {
        const transform = this._transform,
            scale = this._scale,
            origin = this._origin,
            position = this._position,
            cx = scale.x * this._cos,
            sx = scale.x * this._sin,
            cy = scale.y * this._cos,
            sy = scale.y * this._sin;

        transform.a = cx;
        transform.b = sy;
        transform.x = (origin.x * -cx) - (origin.y * sy) + position.x;

        transform.c = -sx;
        transform.d = cy;
        transform.y = (origin.x * sx) - (origin.y * cy) + position.y;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Transformable}
     */
    setPosition(x, y = x) {
        this._position.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Transformable}
     */
    setScale(x, y = x) {
        this._scale.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {Transformable}
     */
    setOrigin(x, y = x)  {
        this._origin.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {Transformable}
     */
    setRotation(degrees) {
        const trimmed = degrees % 360,
            rotation = trimmed < 0 ? trimmed + 360 : trimmed,
            radians = degreesToRadians(rotation);

        this._rotation = rotation;
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
     * @returns {Transformable}
     */
    translate(x, y) {
        return this.setPosition(this.x + x, this.y + y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {Transformable}
     */
    rotate(angle) {
        return this.setRotation(this._rotation + angle);
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._transform.destroy();
        this._transform = null;

        this._position.destroy();
        this._position = null;

        this._scale.destroy();
        this._scale = null;

        this._origin.destroy();
        this._origin = null;

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
