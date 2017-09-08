import Transformable from '../core/Transformable';
import Matrix from '../core/Matrix';
import Rectangle from '../core/Rectangle';

/**
 * @class Renderable
 * @extends {Exo.Transformable}
 * @memberof Exo
 */
export default class Renderable extends Transformable {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._worldTransform = new Matrix();

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._bounds = new Rectangle();

        /**
         * @private
         * @member {Boolean}
         */
        this._visible = true;

        /**
         * @private
         * @member {?Exo.Renderable}
         */
        this._parent = null;
    }

    /**
     * @public
     * @member {Exo.Matrix}
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
     * @member {?Exo.Renderable}
     */
    get parent() {
        return this._parent;
    }

    set parent(value) {
        this._parent = value;
    }

    /**
     * @public
     * @member {Exo.Rectangle}
     */
    get bounds() {
        return this.getBounds();
    }

    /**
     * @public
     * @returns {Exo.Rectangle}
     */
    getBounds() {
        return this._bounds.set(this.x, this.y, 0, 0);
    }

    /**
     * @public
     * @virtual
     * @chainable
     * @param {Exo.DisplayManager} renderManager
     * @param {Exo.Matrix} worldTransform
     * @returns {Exo.Renderable}
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
