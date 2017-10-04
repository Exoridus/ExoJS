import SceneNode from '../core/SceneNode';
import Color from '../core/Color';

/**
 * @class Renderable
 * @extends {SceneNode}
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
     * @virtual
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
    }
}
