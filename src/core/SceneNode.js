import Matrix from '../types/Matrix';
import Rectangle from '../types/Rectangle';
import Bounds from './Bounds';
import Collision from './Collision';
import Interval from '../types/Interval';
import Vector from '../types/Vector';
import ObservableVector from '../types/ObservableVector';
import { FLAGS } from '../const';
import Flags from './Flags';
import { degreesToRadians } from '../utils/math';

/**
 * @class SceneNode
 */
export default class SceneNode {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {?SceneNode}
         */
        this._parent = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._localBounds = new Rectangle();

        /**
         * @private
         * @member {Bounds}
         */
        this._bounds = new Bounds();

        /**
         * @private
         * @member {Matrix}
         */
        this._localTransform = new Matrix();

        /**
         * @private
         * @member {Matrix}
         */
        this._globalTransform = new Matrix();

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
         * @member {ObservableVector}
         */
        this._anchor = new ObservableVector(this._updateOrigin, this, 0, 0);

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
     * @member {?SceneNode}
     */
    get parent() {
        return this._parent;
    }

    set parent(parent) {
        this._parent = parent;
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
     * @member {Vector}
     */
    get anchor() {
        return this._anchor;
    }

    set anchor(anchor) {
        this._anchor.copy(anchor);
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get localBounds() {
        return this.getLocalBounds();
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get bounds() {
        return this.getBounds();
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
     * @returns {SceneNode}
     */
    setPosition(x, y = x) {
        this._position.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} degrees
     * @returns {SceneNode}
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
     * @returns {SceneNode}
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
     * @returns {SceneNode}
     */
    setOrigin(x, y = x)  {
        this._origin.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} [y=x]
     * @returns {SceneNode}
     */
    setAnchor(x, y = x)  {
        this._anchor.set(x, y);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} x
     * @param {Number} y
     * @returns {SceneNode}
     */
    move(x, y) {
        return this.setPosition(this.x + x, this.y + y);
    }

    /**
     * @public
     * @chainable
     * @param {Number} degrees
     * @returns {SceneNode}
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

        return this._localTransform;
    }

    /**
     * @public
     * @chainable
     * @returns {SceneNode}
     */
    updateTransform() {
        if (this._flags.has(FLAGS.ROTATION)) {
            const radians = degreesToRadians(this._rotation);

            this._cos = Math.cos(radians);
            this._sin = Math.sin(radians);
        }

        if (this._flags.has(FLAGS.ROTATION | FLAGS.SCALING)) {
            this._localTransform.a = this._scale.x * this._cos;
            this._localTransform.b = this._scale.y * this._sin;

            this._localTransform.c = -this._scale.x * this._sin;
            this._localTransform.d =  this._scale.y * this._cos;
        }

        if (this._rotation) {
            this._localTransform.x = (this._origin.x * -this._localTransform.a) - (this._origin.y * this._localTransform.b) + this._position.x;
            this._localTransform.y = (this._origin.x * -this._localTransform.c) - (this._origin.y * this._localTransform.d) + this._position.y;
        } else {
            this._localTransform.x = (this._origin.x * -this._scale.x) + this._position.x;
            this._localTransform.y = (this._origin.y * -this._scale.y) + this._position.y;
        }

        return this;
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getLocalBounds() {
        return this._localBounds;
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        this.updateGlobalTransform();
        this.updateBounds();

        return this._bounds.getRect();
    }

    /**
     * @public
     * @chainable
     * @returns {SceneNode}
     */
    updateBounds() {
        this._bounds.reset()
            .addRect(this.getLocalBounds(), this.getGlobalTransform());

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {SceneNode}
     */
    updateGlobalTransform() {
        if (this._parent) {
            this._parent.updateGlobalTransform();
        }

        this.updateTransform();

        return this;
    }

    /**
     * @public
     * @returns {Matrix}
     */
    getGlobalTransform() {
        this._globalTransform.copy(this.getTransform());

        if (this._parent) {
            this._globalTransform.multiply(this._parent.getGlobalTransform());
        }

        return this._globalTransform;
    }

    /**
     * @public
     * @returns {Vector[]}
     */
    getNormals() {
        return this.getBounds().getNormals();
    }

    /**
     * @public
     * @param {Vector} axis
     * @param {Interval} [result=new Interval()]
     * @returns {Interval}
     */
    project(axis, result = new Interval()) {
        return this.getBounds().project(axis, result);
    }

    /**
     * @public
     * @param {Number} x
     * @param {Number} y
     * @returns {Boolean}
     */
    contains(x, y) {
        return this.getBounds().contains(x, y);
    }

    /**
     * @public
     * @param {SceneNode} target
     * @returns {Boolean}
     */
    intersects(target) {
        if (!target) {
            throw new Error('No collision target provided.');
        }

        if ((this._rotation % 90 === 0) && (target.rotation % 90 === 0)) {
            return Collision.intersectionRectRect(this.getBounds(), target.getBounds());
        }

        return Collision.intersectionSAT(this, target);
    }

    /**
     * @public
     * @param {SceneNode} target
     * @returns {?Collision}
     */
    getCollision(target) {
        if (!target) {
            throw new Error('No collision target provided.');
        }

        if ((this._rotation % 90 === 0) && (target.rotation % 90 === 0)) {
            return Collision.collisionRectRect(this.getBounds(), target.getBounds());
        }

        return Collision.collisionSAT(this, target);
    }

    /**
     * @override
     */
    destroy() {
        this._localTransform.destroy();
        this._localTransform = null;

        this._globalTransform.destroy();
        this._globalTransform = null;

        this._position.destroy();
        this._position = null;

        this._scale.destroy();
        this._scale = null;

        this._origin.destroy();
        this._origin = null;

        this._localBounds.destroy();
        this._localBounds = null;

        this._bounds.destroy();
        this._bounds = null;

        this._anchor.destroy();
        this._anchor = null;

        this._flags.destroy();
        this._flags = null;

        this._parent = null;
        this._rotation = null;
        this._sin = null;
        this._cos = null;
    }

    /**
     * @private
     */
    _updateOrigin() {
        const { width, height } = this.getBounds();

        this.setOrigin(width * this._anchor.x, height * this._anchor.y);
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
