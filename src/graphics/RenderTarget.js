import Vector from '../math/Vector';

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
         * @member {Vector}
         */
        this._size = new Vector(width, height);

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
     * @member {Vector}
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
        return this._size.x;
    }

    set width(width) {
        this._size.x = width | 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(height) {
        this._size.y = height | 0;
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
