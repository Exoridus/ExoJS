import Transformable from '../math/Transformable';
import Matrix from '../math/Matrix';
import Rectangle from '../math/Rectangle';
import Bounds from './Bounds';
import Collision from './Collision';
import Interval from '../math/Interval';
import Vector from '../math/Vector';
import ObservableVector from '../math/ObservableVector';
import { FLAGS } from '../const/core';

/**
 * @class SceneNode
 * @extends Transformable
 */
export default class SceneNode extends Transformable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {?SceneNode}
         */
        this._parent = null;

        /**
         * @private
         * @member {Matrix}
         */
        this._globalTransform = new Matrix();

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
         * @member {ObservableVector}
         */
        this._anchor = new ObservableVector(this._updateOrigin, this, 0, 0);
    }

    /**
     * @public
     * @member {?Scene}
     */
    get scene() {
        return this._scene;
    }

    set scene(scene) {
        this._scene = scene;
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
     * @member {Matrix}
     */
    get globalTransform() {
        return this.getGlobalTransform();
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
        this.updateParentTransforms();
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
    updateParentTransforms() {
        if (this._parent) {
            this._parent.updateParentTransforms();
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
            this._globalTransform.combine(this._parent.getGlobalTransform());
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
     * @param {SceneNode} node
     * @returns {Boolean}
     */
    intersects(node) {
        if ((this.rotation % 90 === 0) && (node.rotation % 90 === 0)) {
            return Collision.intersectionRectRect(this.getBounds(), node.getBounds());
        }

        return Collision.intersectionSAT(this, node);
    }

    /**
     * @public
     * @param {SceneNode} node
     * @returns {?Collision}
     */
    getCollision(node) {
        if ((this.rotation % 90 === 0) && (node.rotation % 90 === 0)) {
            return Collision.collisionRectRect(this.getBounds(), node.getBounds());
        }

        return Collision.collisionSAT(this, node);
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
     * @override
     */
    destroy() {
        super.destroy();

        this._globalTransform.destroy();
        this._globalTransform = null;

        this._localBounds.destroy();
        this._localBounds = null;

        this._bounds.destroy();
        this._bounds = null;

        this._anchor.destroy();
        this._anchor = null;

        this._parent = null;
    }

    /**
     * @private
     */
    _updateOrigin() {
        const { x, y } = this._anchor,
            { width, height } = this.getBounds();

        this.setOrigin(width * x, height * y);
    }
}
