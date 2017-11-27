import Transformable from '../math/Transformable';
import Matrix from '../math/Matrix';
import Rectangle from '../math/Rectangle';
import Bounds from './Bounds';

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

        if (this._updateTransform) {
            this.updateTransform();
            this._updateTransform = false;
        }

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
     * @param {Number} x
     * @param {Number} [y=x]
     * @param {Boolean} [relative=true]
     * @returns {SceneNode}
     */
    setOrigin(x, y = x, relative = true) {
        if (relative) {
            const bounds = this.getBounds();

            x *= bounds.width;
            y *= bounds.height;
        }

        this.origin.set(x, y);

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

        this._parent = null;
    }
}
