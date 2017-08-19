import Transformable from '../core/Transformable';
import Matrix from '../core/Matrix';
import Rectangle from '../core/Rectangle';

/**
 * @class Drawable
 * @extends {Exo.Transformable}
 * @memberof Exo
 */
export default class Drawable extends Transformable {

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
         * @member {Boolean}
         */
        this._visible = true;

        /**
         * @private
         * @member {Exo.Drawable|null}
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
     * @member {Exo.Drawable|null}
     */
    get parent() {
        return this._parent;
    }

    set parent(value) {
        this._parent = value;
    }

    /**
     * @public
     * @returns {Exo.Rectangle}
     */
    getBounds() {
        return this.getLocalBounds();
    }

    /**
     * @public
     * @returns {Exo.Rectangle}
     */
    getLocalBounds() {
        return Rectangle.Empty;
    }

    /**
     * @public
     * @virtual
     * @param {Exo.DisplayManager} renderManager
     * @param {Exo.Matrix} worldTransform
     */
    draw(renderManager, worldTransform) {
        // do nothing
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._worldTransform = null;
        this._visible = false;
        this._parent = null;
    }
}
