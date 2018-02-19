import { getCanvasContext } from '../utils/rendering';
import { findElement, imageToBase64 } from '../utils/core';
import support from '../support';
import Texture from './Texture';
import RenderTarget from './RenderTarget';
import Color from '../types/Color';
import ObservableSize from '../types/ObservableSize';

/**
 * @class Screen
 */
export default class Screen {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {?HTMLCanvasElement|?String} [options.canvas=document.createElement('canvas')]
     * @param {Number} [options.width=800]
     * @param {Number} [options.height=600]
     * @param {Boolean} [options.antialias=false]
     * @param {Boolean} [options.preserveDrawingBuffer=false]
     * @param {?Element|?String} [options.parent=document.body]
     * @param {Color} [options.backgroundColor=Color.Black]
     */
    constructor({
        canvas = document.createElement('canvas'),
        width = 800,
        height = 600,
        antialias = false,
        preserveDrawingBuffer = false,
        parent = document.body,
        background = Color.Black,
    } = {}) {
        if (!support.webGL2) {
            throw new Error('This browser or hardware does not support WebGL2!');
        }

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = findElement(canvas);
        this._canvas.width = width;
        this._canvas.height = height;

        /**
         * @private
         * @member {HTMLElement}
         */
        this._parent = findElement(parent);

        if (this._parent) {
            this._parent.appendChild(this._canvas);
        }

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = getCanvasContext(this._canvas, 'webgl2', {
            alpha: background.a < 1,
            antialias: antialias,
            premultipliedAlpha: false,
            preserveDrawingBuffer: preserveDrawingBuffer,
            stencil: false,
            depth: false,
        });

        if (!this._context) {
            throw new Error('WebGL2 context is not available!');
        }

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = new RenderTarget(width, height, {
            clearColor: background,
            root: true,
        });

        /**
         * @private
         * @member {Color}
         */
        this._background = background.clone();

        /**
         * @private
         * @member {ObservableSize}
         */
        this._size = new ObservableSize(this._onSizeChanged, this, width, height);

        /**
         * @private
         * @member {Boolean}
         */
        this._contextLost = this._context.isContextLost();

        /**
         * @private
         * @member {String}
         */
        this._cursor = this._canvas.style.cursor;

        /**
         * @private
         * @member {String}
         */
        this._cursorText = this._cursor;

        this._setupContext();
        this._addEvents();
    }

    /**
     * @public
     * @readonly
     * @member {HTMLCanvasElement}
     */
    get canvas() {
        return this._canvas;
    }

    /**
     * @public
     * @readonly
     * @member {WebGL2RenderingContext}
     */
    get context() {
        return this._context;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get contextLost() {
        return this._contextLost;
    }

    /**
     * @public
     * @readonly
     * @member {RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    /**
     * @public
     * @readonly
     * @member {?HTMLElement}
     */
    get parent() {
        return this._parent;
    }

    set parent(parent) {
        if (this._parent !== parent) {
            if (this._parent) {
                this._parent.removeChild(this._canvas);
            }

            this._parent = parent;

            if (this._parent) {
                this._parent.appendChild(this._canvas);
            }
        }
    }

    /**
     * @public
     * @member {Color}
     */
    get background() {
        return this._background;
    }

    set background(background) {
        this.setBackground(background);
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
     * @member {String}
     */
    get cursor() {
        return this._cursor;
    }

    set cursor(cursor) {
        this.setCursor(cursor);
    }

    /**
     * @public
     * @chainable
     * @param {Color} background
     * @returns {Screen}
     */
    setBackground(background) {
        this._background.copy(background);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Screen}
     */
    setSize(width, height) {
        this._size.set(width, height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String|HTMLImageElement|Texture} cursor
     * @returns {Screen}
     */
    setCursor(cursor) {
        if (cursor !== this._cursor) {
            this._cursor = cursor;
            this._cursorText = cursor;

            if (cursor instanceof Texture) {
                this._cursorText = cursor.source;
            }

            if (cursor instanceof HTMLImageElement) {
                this._cursorText = `url(${imageToBase64(cursor)})`;
            }

            this._canvas.style.cursor = this._cursorText;
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._removeEvents();

        if (this._parent) {
            this._parent.removeChild(this._canvas);
            this._parent = null;
        }

        this._renderTarget.destroy();
        this._renderTarget = null;

        this._background.destroy();
        this._background = null;

        this._size.destroy();
        this._size = null;

        this._contextLost = null;
        this._context = null;
        this._canvas = null;
        this._cursor = null;
        this._cursorText = null;
    }

    /**
     * @private
     */
    _setupContext() {
        const gl = this._context,
            { r, g, b, a } = this._background;

        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);

        gl.enable(gl.BLEND);

        gl.blendEquation(gl.FUNC_ADD);
        gl.clearColor(r / 255, g / 255, b / 255, a);
    }

    /**
     * @private
     */
    _addEvents() {
        this._onContextLostHandler = this._onContextLost.bind(this);
        this._onContextRestoredHandler = this._onContextRestored.bind(this);

        this._canvas.addEventListener('webglcontextlost', this._onContextLostHandler, false);
        this._canvas.addEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
    }

    /**
     * @private
     */
    _removeEvents() {
        this._canvas.removeEventListener('webglcontextlost', this._onContextLostHandler, false);
        this._canvas.removeEventListener('webglcontextrestored', this._onContextRestoredHandler, false);

        this._onContextLostHandler = null;
        this._onContextRestoredHandler = null;
    }

    /**
     * @private
     */
    _onContextLost() {
        this._contextLost = true;
    }

    /**
     * @private
     */
    _onContextRestored() {
        this._contextLost = false;
    }

    /**
     * @private
     */
    _onSizeChanged() {
        const { width, height } = this._size;

        this._canvas.width = width;
        this._canvas.height = height;
        this._renderTarget.resize(width, height);
    }
}
