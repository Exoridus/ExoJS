import Transformable from '../core/Transformable';
import Matrix from '../core/Matrix';
import Rectangle from '../core/shape/Rectangle';

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
         * @member {Matrix}
         */
        this._worldTransform = new Matrix();

        /**
         * @private
         * @member {Rectangle}
         */
        this._bounds = new Rectangle();

        /**
         * @private
         * @member {Boolean}
         */
        this._visible = true;

        /**
         * @private
         * @member {?Renderable}
         */
        this._parent = null;
    }

    /**
     * @public
     * @member {Matrix}
     */
    get worldTransform() {
        return this._worldTransform;
    }

    set worldTransform(value) {
        this._worldTransform.copy(value);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get visible() {
        return this._visible;
    }

    set visible(value) {
        this._visible = value;
    }

    /**
     * @public
     * @member {?Renderable}
     */
    get parent() {
        return this._parent;
    }

    set parent(value) {
        this._parent = value;
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @returns {Rectangle}
     */
    getBounds() {
        return this._bounds.set(this.x, this.y, 0, 0);
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
        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._worldTransform.destroy();
        this._worldTransform = null;

        this._bounds.destroy();
        this._bounds = null;

        this._visible = null;
        this._parent = null;
    }
}
