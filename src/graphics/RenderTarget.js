import Size from '../math/Size';
import Color from '../core/Color';
import GLFramebuffer from './webgl/GLFramebuffer';

/**
 * @class RenderTarget
 */
export default class RenderTarget {

    /**
     * @constructor
     * @param {Number} width
     * @param {Number} height
     * @param {Boolean} [root = false]
     */
    constructor(width, height, root = false) {

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(width, height);

        /**
         * @private
         * @member {Boolean}
         */
        this._root = root;

        /**
         * @private
         * @member {?DisplayManager}
         */
        this._displayManager = null;

        /**
         * @private
         * @member {?GLFramebuffer}
         */
        this._framebuffer = null;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get root() {
        return this._root;
    }

    set root(root) {
        this._root = root;
    }

    /**
     * @public
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this.resize(size.width, size.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this.resize(width, this.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this.resize(this.width, height);
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return this._displayManager && (this._displayManager.renderTarget === this);
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {RenderTarget}
     */
    resize(width, height) {
        if (this.width !== width || this.height !== height) {
            this._size.set(width, height);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {RenderTarget}
     */
    bind(displayManager) {
        if (!this._displayManager) {
            this._displayManager = displayManager;
            this._framebuffer = this._root ? null : new GLFramebuffer(displayManager.context);
        }

        if (this._framebuffer && !this.bound) {
            this._framebuffer.bind();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
     */
    unbind() {
        if (this._framebuffer && this.bound) {
            this._framebuffer.unbind();
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.unbind();

        if (this._framebuffer) {
            this._framebuffer.destroy();
            this._framebuffer = null;
        }

        this._size.destroy();
        this._size = null;

        this._root = null;
        this._displayManager = null;
    }
}
