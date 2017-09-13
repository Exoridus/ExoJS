import EventEmitter from './EventEmitter';
import ObservableVector from './ObservableVector';
import Matrix from './Matrix';
import { DEG_TO_RAD } from '../const';

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
        this._origin = new ObservableVector(this._setDirty, this, 0, 0);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirtyTransform = true;
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
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    set position(position) {
        this._position.copy(position);
    }

    /**
     * @public
     * @member {Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(scale) {
        this._scale.copy(scale);
    }

    /**
     * @public
     * @member {Vector}
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
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Transformable}
     */
    setPosition(x, y) {
        this._position.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Transformable}
     */
    setScale(x, y) {
        this._scale.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Transformable}
     */
    setOrigin(x, y) {
        this._origin.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {Transformable}
     */
    setRotation(angle) {
        const rotation = angle % 360;

        this._rotation = (rotation < 0) ? rotation + 360 : rotation;
        this._dirtyTransform = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Transformable}
     */
    move(x, y) {
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
     * @chainable
     * @returns {Transformable}
     */
    updateTransform() {
        const transform = this._transform,
            position = this._position,
            scale = this._scale,
            origin = this._origin,
            angle = this._rotation * DEG_TO_RAD,
            cos = Math.cos(angle),
            sin = Math.sin(angle),
            sxc = scale.x * cos,
            syc = scale.y * cos,
            sxs = scale.x * sin,
            sys = scale.y * sin;

        transform.a = sxc;
        transform.b = sys;
        transform.x = (origin.x * -sxc) - (origin.y * sys) + position.x;

        transform.c = -sxs;
        transform.d = syc;
        transform.y = (origin.x * sxs) - (origin.y * syc) + position.y;

        return this;
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
        this._dirtyTransform = null;
    }

    /**
     * @private
     */
    _setDirty() {
        this._dirtyTransform = true;
    }
}
