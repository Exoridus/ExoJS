import Vector from '../math/Vector';
import Size from '../math/Size';

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
         * @member {Size}
         */
        this._size = new Size(width, height);

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get isRoot() {
        return this._isRoot;
    }

    set isRoot(isRoot) {
        this._isRoot = isRoot;
    }

    /**
     * @public
     * @member {Size}
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
        this._size.width = width | 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this._size.height = height | 0;
    }

    /**
     * @public
     * @param {RenderState} renderState
     */
    bind(renderState) {
        if (!this._renderState) {
            this._renderState = renderState;
        }

        this._renderState.bindRenderTarget(this);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._renderState) {
            this._renderState.removeRenderTarget(this);
            this._renderState = null;
        }

        this._size.destroy();
        this._size = null;

        this._isRoot = null;
    }
}
