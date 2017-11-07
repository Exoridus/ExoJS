import ObservableSize from '../math/ObservableSize';

/**
 * @class RenderTarget
 */
export default class RenderTarget {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} [isRoot = false]
     */
    constructor(width, height, isRoot = false) {

        /**
         * @private
         * @member {ObservableSize}
         */
        this._size = new ObservableSize(this.updateSize, this, width, height);

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?GLFramebuffer}
         */
        this._glFramebuffer = null;
    }

    /**
     * @public
     * @member {ObservableSize}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size.copy(size);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this._size.width = width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this._size.height = height;
    }

    /**
     * @public
     * @chainable
     * @param {RenderState} renderState
     * @returns {RenderTarget}
     */
    bind(renderState) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._glFramebuffer = renderState.createGLFramebuffer(this._isRoot);
        }

        if (!this._bound) {
            this._renderState.glFramebuffer = this._glFramebuffer;
            this._bound = true;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
     */
    unbind() {
        if (this._bound) {
            this._renderState.glFramebuffer = null;
            this._bound = false;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
     */
    updateSize() {
        if (this._glFramebuffer) {
            this._glFramebuffer.size.copy(this._size);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.unbind();

        if (this._glFramebuffer) {
            this._glFramebuffer.destroy();
            this._glFramebuffer = null;
        }

        this._size.destroy();
        this._size = null;

        this._renderState = null;
        this._isRoot = null;
        this._bound = null;
    }
}
