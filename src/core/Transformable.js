import EventEmitter from './EventEmitter';
import Vector from './Vector';
import Matrix from './Matrix';

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
         * @member {Exo.Vector}
         */
        this._position = new Vector();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._scale = new Vector(1, 1);

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._origin = new Vector();

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
        this._dirtyTransform = true;
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
        this._dirtyTransform = true;
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
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(value) {
        this.setScale(value.x, value.y);
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
     * @member {Exo.Vector}
     */
    get origin() {
        return this._origin;
    }

    set origin(value) {
        this.setOrigin(value.x, value.y);
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
    setPosition(x, y) {
        this._position.set(x, y);
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    setScale(x, y) {
        this._scale.set(x, y);
        this._dirtyTransform = true;
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     */
    setOrigin(x, y) {
        this._origin.set(x, y);
        this._dirtyTransform = true;
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
     * @param {Number} x
     * @param {Number} y
     */
    move(x, y) {
        this.setPosition(this.x + x, this.y + y);
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
     */
    updateTransform() {
        const transform = this._transform,
            pos = this._position,
            scale = this._scale,
            origin = this._origin,
            angle = this._rotation * Math.PI / -180,
            cos = Math.cos(angle),
            sin = Math.sin(angle),

            sxc = scale.x * cos,
            syc = scale.y * cos,
            sxs = scale.x * sin,
            sys = scale.y * sin;

        transform.a = sxc;
        transform.b = sys;
        transform.x = (-origin.x * sxc) - (origin.y * sys) + pos.x;

        transform.c = -sxs;
        transform.d = syc;
        transform.y = (origin.x * sxs) - (origin.y * syc) + pos.y;
    }

    destroy() {
        this.off();

        this._position = null;
        this._scale = null;
        this._origin = null;
        this._transform = null;
    }
}
