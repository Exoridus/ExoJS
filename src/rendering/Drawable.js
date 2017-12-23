import SceneNode from '../core/SceneNode';
import Color from '../core/Color';
import { BLEND_MODES } from '../const/graphics';

/**
 * @class Drawable
 * @extends SceneNode
 */
export default class Drawable extends SceneNode {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Boolean}
         */
        this._visible = true;

        /**
         * @private
         * @member {Color}
         */
        this._tint = Color.White.clone();

        /**
         * @private
         * @member {Number}
         */
        this._blendMode = BLEND_MODES.NORMAL;
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
     * @member {Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this.setTint(tint);
    }

    /**
     * @public
     * @member {Number}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        this.setBlendMode(blendMode);
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {Drawable}
     */
    setTint(color) {
        this._tint.copy(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} blendMode
     * @returns {Drawable}
     */
    setBlendMode(blendMode) {
        this._blendMode = blendMode;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {RenderManager} renderManager
     * @returns {Drawable}
     */
    render(renderManager) {
        throw new Error('Method not implemented!');
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._tint.destroy();
        this._tint = null;

        this._visible = null;
        this._blendMode = null;
    }
}
