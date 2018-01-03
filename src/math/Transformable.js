import { FLAGS } from '../const/core';
import EventEmitter from '../core/EventEmitter';
import ObservableVector from './ObservableVector';
import Matrix from './Matrix';
import { degreesToRadians } from '../utils/math';
import Flags from './Flags';

/**
 * @class Transformable
 * @extends EventEmitter
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
        this._position = new ObservableVector(this._setPositionDirty, this, 0, 0);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._scale = new ObservableVector(this._setScalingDirty, this, 1, 1);

        /**
         * @private
         * @member {ObservableVector}
         */
        this._origin = new ObservableVector(this._setOriginDirty, this, 0, 0);

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
         * @member {Flags}
         */
        this._flags = new Flags(FLAGS.TRANSFORM);
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
     * @readonly
     * @member {Flags}
     */
    get flags() {
        return this._flags;
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
     * @param {Number} degrees
     * @returns {Transformable}
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
     * @param {Number} degrees
     * @returns {Transformable}
     */
    rotate(degrees) {
        return this.setRotation(this._rotation + degrees);
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
     * @returns {Transformable}
     */
    updateTransform() {
        if (this._flags.has(FLAGS.ROTATION)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this._flags.has(FLAGS.ROTATION | FLAGS.SCALING)) {
            const { x, y } = this._scale;

            this._transform.a = x * this._cos;
            this._transform.b = y * this._sin;

            this._transform.c = -x * this._sin;
            this._transform.d =  y * this._cos;
        }

        if (this._rotation) {
            const { x, y } = this._origin;

            this._transform.x = (x * -this._transform.a) - (y * this._transform.b) + this._position.x;
            this._transform.y = (x * -this._transform.c) - (y * this._transform.d) + this._position.y;
        } else {
            this._transform.x = (this._origin.x * -this._scale.x) + this._position.x;
            this._transform.y = (this._origin.y * -this._scale.y) + this._position.y;
        }

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

        this._flags.destroy();
        this._flags = null;

        this._rotation = null;
        this._sin = null;
        this._cos = null;
    }

    /**
     * @private
     */
    _setPositionDirty() {
        this._flags.add(FLAGS.TRANSLATION);
    }

    /**
     * @private
     */
    _setRotationDirty() {
        this._flags.add(FLAGS.ROTATION);
    }

    /**
     * @private
     */
    _setScalingDirty() {
        this._flags.add(FLAGS.SCALING);
    }

    /**
     * @private
     */
    _setOriginDirty() {
        this._flags.add(FLAGS.ORIGIN);
    }
}
