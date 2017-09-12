import View from './View';
import Rectangle from '../core/shape/Rectangle';
import Vector from '../core/shape/Vector';

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
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._frameBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;

        /**
         * @private
         * @member {Vector}
         */
        this._size = new Vector(width, height);

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new Rectangle();

        /**
         * @private
         * @member {View}
         */
        this._defaultView = new View(new Rectangle(0, 0, width, height));

        /**
         * @private
         * @member {View}
         */
        this._view = this._defaultView;
    }

    /**
     * @public
     * @member {Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.x;
    }

    set width(value) {
        this._size.x = value | 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.y;
    }

    set height(value) {
        this._size.y = value | 0;
    }

    /**
     * @public
     * @readonly
     * @member {Matrix}
     */
    get projection() {
        return this._view.transform;
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._frameBuffer = this._isRoot ? null : gl.createFramebuffer();
        }
    }

    /**
     * @public
     */
    bind() {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameBuffer);
    }

    /**
     * @public
     * @param {View} view
     * @returns {Rectangle}
     */
    getViewport(view) {
        const width = this.width,
            height = this.height,
            viewport = view.viewport;

        return this._viewport.set(
            (0.5 + (width * viewport.x)) | 0,
            (0.5 + (height * viewport.y)) | 0,
            (0.5 + (width * viewport.width)) | 0,
            (0.5 + (height * viewport.height)) | 0,
        );
    }

    /**
     * @public
     */
    updateViewport() {
        const gl = this._context,
            viewport = this.getViewport(this._view);

        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     */
    resize(width, height) {
        this._size.set(width, height);

        this.updateViewport();
    }

    /**
     * @public
     * @param {View} view
     */
    setView(view) {
        this._view = view;

        this.updateViewport();
    }

    /**
     * @public
     */
    destroy() {
        if (this._frameBuffer) {
            this._context.deleteFramebuffer(this._frameBuffer);
            this._frameBuffer = null;
        }

        this._defaultView.destroy();
        this._defaultView = null;

        this._viewport.destroy();
        this._viewport = null;

        this._size.destroy();
        this._size = null;

        this._view = null;
        this._isRoot = null;
        this._context = null;
    }
}
