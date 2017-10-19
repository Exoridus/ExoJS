import RenderState from './RenderState';
import RenderTarget from './RenderTarget';
import SpriteRenderer from './sprite/SpriteRenderer';
import ParticleRenderer from '../extras/particle/ParticleRenderer';
import Color from '../core/Color';
import View from './View';
import Rectangle from '../math/Rectangle';
import settings from '../settings';
import support from '../support';

/**
 * @class DisplayManager
 */
export default class DisplayManager {

    /**
     * @constructor
     * @param {Application} app
     * @param {Object} [config]
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Color} [config.clearColor=Color.Black]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    constructor(app, {
        width = 800,
        height = 600,
        clearColor = Color.Black,
        clearBeforeRender = true,
        contextOptions = {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            stencil: true,
            depth: false,
        },
    } = {}) {
        if (!support.webGL) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = app.canvas;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = this._createContext(contextOptions);

        if (!this._context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {Boolean}
         */
        this._contextLost = this._context.isContextLost();

        if (this._contextLost && this._context.getExtension('WEBGL_lose_context')) {
            this._context.getExtension('WEBGL_lose_context').restoreContext();
        }

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = new RenderTarget(width, height, true);

        /**
         * @private
         * @member {View}
         */
        this._view = new View(new Rectangle(0, 0, width, height));

        /**
         * @private
         * @member {Boolean}
         */
        this._clearBeforeRender = clearBeforeRender;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRendering = false;

        /**
         * @private
         * @member {RenderState}
         */
        this._renderState = new RenderState(this._context);
        this._renderState.blendMode = settings.BLEND_MODE;
        this._renderState.clearColor = clearColor;

        this._renderTarget.bind(this._renderState);

        this._addEvents();
        this._setupGL();

        this.addRenderer('sprite', new SpriteRenderer())
            .addRenderer('particle', new ParticleRenderer())
            .resize(width, height);
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
     * @returns {DisplayManager}
     */
    addRenderer(name, renderer) {
        if (this._renderers.has(name)) {
            throw new Error(`Renderer "${name}" was already added.`);
        }

        this._renderers.set(name, renderer);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @returns {Renderer}
     */
    getRenderer(name) {
        if (!this._renderers.has(name)) {
            throw new Error(`Could not find renderer "${name}".`);
        }

        return this._renderers.get(name);
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    updateViewport() {
        const width = this._renderTarget.width,
            height = this._renderTarget.height,
            ratio = this._view.viewport;

        this._renderState.viewport = Rectangle.Temp.set(
            Math.round(width * ratio.x),
            Math.round(height * ratio.y),
            Math.round(width * ratio.width),
            Math.round(height * ratio.height)
        );

        this._renderState.projection = this._view.getTransform();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {DisplayManager}
     */
    resize(width, height) {
        this._canvas.width = width;
        this._canvas.height = height;

        this._renderTarget.width = width;
        this._renderTarget.height = height;

        this.updateViewport();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {View} view
     * @returns {DisplayManager}
     */
    setView(view) {
        this._view.copy(view);

        this.updateViewport();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    resetView() {
        this._view.reset(Rectangle.Temp.set(0, 0, this._renderTarget.width, this._renderTarget.height));

        this.updateViewport();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    begin() {
        if (this._isRendering || this._contextLost) {
            return this;
        }

        if (this._clearBeforeRender) {
            this._renderState.clear();
        }

        this._isRendering = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Renderable} renderable
     * @param {String} renderer
     * @returns {DisplayManager}
     */
    render(renderable, renderer) {
        if (!this._isRendering || this._contextLost) {
            return this;
        }

        if (renderable.active && this.isVisible(renderable)) {
            this._renderState.renderer = this.getRenderer(renderer);
            this._renderState.renderer.render(renderable);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    end() {
        if (!this._isRendering || this._contextLost) {
            return this;
        }

        if (this._renderState.renderer) {
            this._renderState.renderer.flush();
        }

        this._isRendering = false;

        return this;
    }

    /**
     * @public
     * @param {Renderable} renderable
     * @returns {Boolean}
     */
    isVisible(renderable) {
        return renderable.active;
    }

    /**
     * @public
     */
    destroy() {
        this._removeEvents();

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._renderers = null;

        this._renderState.destroy();
        this._renderState = null;

        this._view = null;

        this._clearBeforeRender = null;
        this._isRendering = null;
        this._contextLost = null;
        this._context = null;
        this._canvas = null;
    }

    /**
     * @override
     */
    _createContext(options) {
        try {
            return this._canvas.getContext('webgl', options) || this._canvas.getContext('experimental-webgl', options);
        } catch (e) {
            return null;
        }
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
    _setupGL() {
        const gl = this._context;

        gl.colorMask(true, true, true, false);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
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
}
