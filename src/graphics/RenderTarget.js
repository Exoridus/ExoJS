import Size from '../math/Size';
import Framebuffer from './Framebuffer';
import View from './View';
import Rectangle from '../math/Rectangle';
import Vector from '../math/Vector';

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
         * @member {?Framebuffer}
         */
        this._framebuffer = null;

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new Rectangle();

        /**
         * @private
         * @member {View}
         */
        this._defaultView = new View(width / 2, height / 2, width, height);

        /**
         * @private
         * @member {View}
         */
        this._view = this._defaultView;
    }

    /**
     * @public
     * @member {View}
     */
    get view() {
        return this._view;
    }

    set view(view) {
        this.setView(view);
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
        return !!this._displayManager && (this._displayManager.renderTarget === this);
    }

    /**
     * @public
     * @chainable
     * @param {View} view
     * @returns {RenderTarget}
     */
    setView(view) {
        this._view = view || this._defaultView;
        this.updateViewport();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {RenderTarget}
     */
    resize(width, height) {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._defaultView.setSize(width, height);
            this.updateViewport();
        }

        return this;
    }

    /**
     * @public
     * @param {View} [view=this._view]
     * @returns {Rectangle}
     */
    getViewport(view = this._view) {
        const viewport = view.viewport;

        return this._viewport.set(
            Math.round(viewport.x * this.width),
            Math.round(viewport.y * this.height),
            Math.round(viewport.width * this.width),
            Math.round(viewport.height * this.height)
        );
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
     */
    updateViewport() {
        if (this._framebuffer) {
            const viewport = this.getViewport();

            this._framebuffer.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
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
        if (!this._framebuffer) {
            this._framebuffer = new Framebuffer(displayManager.context, this._root);
            this._displayManager = displayManager;
        }

        if (!this.bound) {
            this._framebuffer.bind();
            this.updateViewport();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderTarget}
     */
    unbind() {
        if (this.bound) {
            this._framebuffer.unbind();
        }

        return this;
    }

    /**
     * @public
     * @param {Vector} point
     * @param {View} [view=this._view]
     * @returns {Vector}
     */
    mapPixelToCoords(point, view = this._view) {
        const viewport = this.getViewport(view),
            normalized = new Vector(
                -1 + (2 * (point.x - viewport.left) / viewport.width),
                1 - (2 * (point.y - viewport.top) / viewport.height)
            );

        return normalized.transform(view.getInverseTransform());
    }

    /**
     * @public
     * @param {Vector} point
     * @param {View} [view=this._view]
     * @returns {Vector}
     */
    mapCoordsToPixel(point, view = this._view) {
        const viewport = this.getViewport(view),
            normalized = point.transform(view.getTransform(), new Vector());

        return normalized.set(
            ((( normalized.x + 1) / 2 * viewport.width) + viewport.left) | 0,
            (((-normalized.y + 1) / 2 * viewport.height) + viewport.top) | 0
        );
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

        this._defaultView.destroy();
        this._defaultView = null;

        this._viewport.destroy();
        this._viewport = null;

        this._size.destroy();
        this._size = null;

        this._root = null;
        this._view = null;
        this._displayManager = null;
    }
}
