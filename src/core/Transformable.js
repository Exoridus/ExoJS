import EventEmitter from './EventEmitter';
import ObservableVector from './ObservableVector';
import Matrix from './Matrix';
import {DEG_TO_RAD} from '../const';

/**
 * @class Transformable
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Transformable extends EventEmitter {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._transform = new Matrix();

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._position = new ObservableVector(this._setDirty, this);

        /**
         * @private
         * @member {Exo.ObservableVector}
         */
        this._scale = new ObservableVector(this._setDirty, this, 1, 1);

        /**
         * @private
         * @member {Exo.ObservableVector}
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
    get position() {
        return this._position;
    }

    set position(value) {
        this._position.copy(value);
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(value) {
        this._scale.copy(value);
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get origin() {
        return this._origin;
    }

    set origin(value) {
        this._origin.copy(value);
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
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {Exo.Transformable}
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
     * @returns {Exo.Transformable}
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
     * @returns {Exo.Transformable}
     */
    setOrigin(x, y) {
        this._origin.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {Exo.Transformable}
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
     * @returns {Exo.Transformable}
     */
    move(x, y) {
        return this.setPosition(this.x + x, this.y + y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} angle
     * @returns {Exo.Transformable}
     */
    rotate(angle) {
        return this.setRotation(this._rotation + angle);
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Transformable}
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
