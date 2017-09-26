import Transformable from '../core/Transformable';
import Matrix from '../core/Matrix';
import Rectangle from '../core/shape/Rectangle';
import ObservableVector from '../core/ObservableVector';
import Bounds from './Bounds';

/**
 * @class Renderable
 * @extends {Transformable}
 */
export default class Renderable extends Transformable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {?Renderable}
         */
        this._parent = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._visible = true;

        /**
         * @private
         * @member {Matrix}
         */
        this._worldTransform = new Matrix();

        /**
         * @private
         * @member {Bounds}
         */
        this._bounds = new Bounds();
    }

    /**
     * @public
     * @member {?Renderable}
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
    get visible() {
        return this._visible;
    }

    set visible(visible) {
        this._visible = visible;
    }

    /**
     * @public
     * @readonly
     * @member {Bounds}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @member {Matrix}
     */
    get worldTransform() {
        return this._worldTransform;
    }

    set worldTransform(worldTransform) {
        this._worldTransform.copy(worldTransform);
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getLocalBounds() {
        if (!this._localBounds) {
            this._localBounds = new Rectangle();
        }

        return this._localBounds.set(0, 0, this.width, this.height);
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        this._bounds.reset();

        return this._bounds.getRect();
    }

    /**
     * @public
     * @virtual
     * @chainable
     * @param {DisplayManager} renderManager
     * @param {Matrix} worldTransform
     * @returns {Renderable}
     */
    render(renderManager, worldTransform) {
        if (this.visible) {
            this.worldTransform
                .copy(worldTransform)
                .multiply(this.getTransform());
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        if (this._localBounds) {
            this._localBounds.destroy();
            this._localBounds = null;
        }

        if (this._bounds) {
            this._bounds.destroy();
            this._bounds = null;
        }

        this._worldTransform.destroy();
        this._worldTransform = null;

        this._visible = null;
    }
}
