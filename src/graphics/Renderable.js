import SceneNode from '../core/SceneNode';
import Color from '../core/Color';
import settings from '../settings';

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
        this._blendMode = settings.BLEND_MODE;
    }

    /**
     * @public
     * @member {Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this._tint.copy(tint);
    }

    /**
     * @public
     * @member {Object}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        this._blendMode = blendMode;
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
