import Transformable from './Transformable';
import Matrix from './Matrix';
import Rectangle from './shape/Rectangle';
import Bounds from '../display/Bounds';

/**
 * @class SceneNode
 * @extends {Transformable}
 */
export default class SceneNode extends Transformable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {?Scene}
         */
        this._scene = null;

        /**
         * @private
         * @member {?SceneNode}
         */
        this._parent = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._active = true;

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
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;
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
        this.updateTransformTree();
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
     * @returns {SceneNode}
     */
    updateTransformTree() {
        if (this._parent) {
            this._parent.updateTransformTree();
        }

        if (this._dirtyTransform) {
            this.updateTransform();
            this._dirtyTransform = false;
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
     * @override
     * @param {Boolean} [relative=true]
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

        this._active = null;
        this._parent = null;
    }
}
