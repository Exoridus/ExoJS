import SceneNode from '../core/SceneNode';
import Color from '../core/Color';
import settings from '../settings';
import { BLEND_MODE } from '../const';

/**
 * @class Renderable
 * @extends SceneNode
 */
export default class Renderable extends SceneNode {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {Color}
         */
        this._tint = Color.White.clone();

        /**
         * @private
         * @member {Number}
         */
        this._blendMode = BLEND_MODE.NORMAL;
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
     * @returns {Renderable}
     */
    setTint(color) {
        this._tint.copy(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} blendMode
     * @returns {Renderable}
     */
    setBlendMode(blendMode) {
        this._blendMode = blendMode;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Renderable}
     */
    render(displayManager) {
        throw new Error('Method not implemented!');
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._tint.destroy();
        this._tint = null;

        this._blendMode = null;
    }
}
