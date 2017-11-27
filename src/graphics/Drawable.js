import SceneNode from '../core/SceneNode';

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

        this._visible = null;
    }
}
