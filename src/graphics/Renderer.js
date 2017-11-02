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
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * @private
         * @member {?WebGLBuffer}
         */
        this._indexBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get bound() {
        return this._bound;
    }

    set bound(value) {
        this._bound = value;
    }

    /**
     * @public
     * @param {RenderState} renderState
     */
    bind(renderState) {
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
     */
    destroy() {
        if (this._bound) {
            this.unbind();
        }

        if (this._renderState) {
            this._renderState.deleteBuffer(this._indexBuffer);
            this._indexBuffer = null;

            this._renderState.deleteBuffer(this._vertexBuffer);
            this._vertexBuffer = null;

            this._renderState = null;
        }

        this._bound = null;
    }
}
