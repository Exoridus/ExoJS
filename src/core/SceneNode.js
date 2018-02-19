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
import { removeArrayItems } from '../utils/core';

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
         * @member {SceneNode[]}
         */
        this._children = [];

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
     * @readonly
     * @member {SceneNode[]}
     */
    get children() {
        return this._children;
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
     * @param {Drawable} child
     * @returns {SceneNode}
     */
    addChild(child) {
        return this.addChildAt(child, this._children.length);
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
     * @param {Number} index
     * @returns {SceneNode}
     */
    addChildAt(child, index) {
        if (index < 0 || index > this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        if (child === this) {
            return this;
        }

        if (child.parent) {
            child.parent.removeChild(child);
        }

        child.parent = this;

        this._children.splice(index, 0, child);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} firstChild
     * @param {Drawable} secondChild
     * @returns {SceneNode}
     */
    swapChildren(firstChild, secondChild) {
        if (firstChild !== secondChild) {
            this._children[this.getChildIndex(firstChild)] = secondChild;
            this._children[this.getChildIndex(secondChild)] = firstChild;
        }

        return this;
    }

    /**
     * @public
     * @param {Drawable} child
     * @returns {Number}
     */
    getChildIndex(child) {
        const index = this._children.indexOf(child);

        if (index === -1) {
            throw new Error('Drawable is not a child of the container.');
        }

        return index;
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
     * @param {Number} index
     * @returns {SceneNode}
     */
    setChildIndex(child, index) {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`The index ${index} is out of bounds ${this._children.length}`);
        }

        removeArrayItems(this._children, this.getChildIndex(child), 1);

        this._children.splice(index, 0, child);

        return this;
    }

    /**
     * @public
     * @param {Number} index
     * @returns {Drawable}
     */
    getChildAt(index) {
        if (index < 0 || index >= this._children.length) {
            throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }

        return this._children[index];
    }

    /**
     * @public
     * @chainable
     * @param {Drawable} child
     * @returns {SceneNode}
     */
    removeChild(child) {
        const index = this._children.indexOf(child);

        if (index !== -1) {
            this.removeChildAt(index);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} index
     * @returns {SceneNode}
     */
    removeChildAt(index) {
        removeArrayItems(this._children, index, 1);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [begin=0]
     * @param {Number} [end=this._children.length]
     * @returns {SceneNode}
     */
    removeChildren(begin = 0, end = this._children.length) {
        const range = (end - begin);

        if (range < 0 || range > end) {
            throw new Error('Values are outside the acceptable range.');
        }

        removeArrayItems(this._children, begin, range);

        return this;
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

        for (const child of this._children) {
            if (child.visible) {
                this._bounds.addRect(child.getBounds());
            }
        }

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
        this._children.length = 0;
        this._children = null;

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
