/**
 * @class Renderer
 */
export default class Renderer {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {?RenderManager}
         */
        this._renderManager = null;
    }

    /**
     * @public
     * @chainable
     * @param {*} drawable
     * @returns {Renderer}
     */
    render(drawable) { // eslint-disable-line
        // do nothing
    }

    /**
     * @public
     * @chainable
     * @returns {Renderer}
     */
    flush() {
        // do nothing
    }

    /**
     * @public
     * @param {RenderManager} renderManager
     */
    bind(renderManager) {
        // do nothing
    }

    /**
     * @public
     * @chainable
     * @returns {Renderer}
     */
    unbind() {
        // do nothing
    }

    /**
     * @public
     */
    destroy() {
        this.unbind();

        this._renderManager = null;
    }
}
