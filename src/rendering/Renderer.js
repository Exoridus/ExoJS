/**
 * @class Renderer
 */
export default class Renderer {

    /**
     * @constructor
     */
    constructor() {

    }

    /**
     * @public
     * @param {RenderManager} renderManager
     */
    connect(renderManager) {
        // do nothing
    }

    /**
     * @public
     * @chainable
     * @returns {Renderer}
     */
    disconnect() {
        // do nothing
    }

    /**
     * @public
     */
    bind() {
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
     * @chainable
     * @param drawable
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
     */
    destroy() {
        this._renderManager = null;
        this._context = null;
    }
}
