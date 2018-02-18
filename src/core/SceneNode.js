import Transformable from './Transformable';
import Matrix from '../types/Matrix';
import Rectangle from '../types/Rectangle';
import Bounds from './Bounds';
import Collision from './Collision';
import Interval from '../types/Interval';
import Vector from '../types/Vector';
import ObservableVector from '../types/ObservableVector';

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

        /**
         * @private
         * @member {?SceneNode}
         */
        this._parent = null;

        /**
         * @private
         * @member {?Circle|?Rectangle|?Polygon}
         */
        this._hitbox = null;
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
     * @member {?Circle|?Rectangle|?Polygon}
     */
    get hitbox() {
        return this._hitbox;
    }

    set hitbox(hitbox) {
        this._hitbox = hitbox;
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
        this.updateParentTransform();
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
    updateParentTransform() {
        if (this._parent) {
            this._parent.updateParentTransform();
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
        this._hitbox = null;
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
