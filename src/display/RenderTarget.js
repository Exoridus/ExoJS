import View from './View';
import Rectangle from '../core/Rectangle';
import Vector from '../core/Vector';

/**
 * @class RenderTarget
 * @memberof Exo
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
         * @member {WebGLRenderingContext|null}
         */
        this._context = null;

        /**
         * @private
         * @member {WebGLFramebuffer|null}
         */
        this._frameBuffer = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRoot = isRoot;

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._size = new Vector(width, height);

        /**
         * @private
         * @member {Exo.View}
         */
        this._defaultView = new View(new Rectangle(0, 0, width, height));

        /**
         * @private
         * @member {Exo.View}
         */
        this._view = this._defaultView;
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
     * @member {Exo.Vector}
     */
    get size() {
        return this._size;
    }

    set size(value) {
        this._size.copy(value);
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (this._context) {
            return;
        }

        this._context = gl;
        this._frameBuffer = this._isRoot ? null : gl.createFramebuffer();
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
     * @param {Exo.View} view
     * @returns {Exo.Rectangle}
     */
    getViewport(view) {
        const width = this.width,
            height = this.height,
            viewport = view.viewport;

        return new Rectangle(
            (0.5 + (width * viewport.x)) | 0,
            (0.5 + (height * viewport.y)) | 0,
            (0.5 + (width * viewport.width)) | 0,
            (0.5 + (height * viewport.height)) | 0
        );
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
     */
    updateViewport() {
        const viewport = this.getViewport(this._view);

        this._context.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    }

    /**
     * @public
     * @param {Exo.View} view
     */
    setView(view) {
        this._view = view;
        this.updateViewport();
    }

    getProjection() {
        return this._view.transform;
    }
}
