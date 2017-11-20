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
         * @member {?DisplayManager}
         */
        this._displayManager = null;
    }

    /**
     * @public
     * @chainable
     * @param {*} renderable
     * @returns {Renderer}
     */
    render(renderable) { // eslint-disable-line
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
     * @param {DisplayManager} displayManager
     */
    bind(displayManager) {
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

        this._displayManager = null;
    }
}
