import RenderTarget from './RenderTarget';
import SpriteRenderer from './SpriteRenderer';
import ParticleRenderer from '../extras/particle/ParticleRenderer';
import Color from '../core/Color';
import Matrix from '../math/Matrix';
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
     * @param {Color} [config.clearColor=Color.White]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    constructor(app, {
        width = 800,
        height = 600,
        clearColor = Color.White,
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
         * @member {WebGLRenderingContext}
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
         * @member {Color}
         */
        this._clearColor = clearColor.clone();

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
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?Renderer}
         */
        this._currentRenderer = null;

        /**
         * @private
         * @member {RenderTarget}
         */
        this._rootRenderTarget = new RenderTarget(width, height, true);

        /**
         * @private
         * @member {?RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {Matrix}
         */
        this._projection = new Matrix();

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new Rectangle();

        /**
         * @private
         * @member {View}
         */
        this._view = new View(new Rectangle(0, 0, width, height));

        this._addEvents();
        this._setupGL();

        this.setClearColor(this._clearColor);
        this.setRenderTarget(this._rootRenderTarget);

        this.addRenderer('sprite', new SpriteRenderer());
        this.addRenderer('particle', new ParticleRenderer());

        this.resize(width, height);
    }

    /**
     * @public
     * @readonly
     * @member {WebGLRenderingContext}
     */
    get context() {
        return this._context;
    }

    /**
     * @public
     * @member {RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    set renderTarget(renderTarget) {
        this.setRenderTarget(renderTarget);
    }

    /**
     * @public
     * @member {Color}
     */
    get clearColor() {
        return this._clearColor;
    }

    set clearColor(color) {
        this.setClearColor(color);
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
     * @param {String} name
     * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
     */
    addRenderer(name, renderer) {
        if (this._renderers.has(name)) {
            throw new Error(`Renderer "${name}" was already added.`);
        }

        renderer.setContext(this._context);
        this._renderers.set(name, renderer);
    }

    /**
     * @public
     * @param {String} name
     * @returns {Renderer}
     */
    getRenderer(name) {
        if (!this._renderers.has(name)) {
            throw new Error(`Could not find renderer "${name}".`);
        }

        const renderer = this._renderers.get(name),
            currentRenderer = this._currentRenderer;

        if (currentRenderer !== renderer) {
            if (currentRenderer) {
                currentRenderer.unbind();
            }

            this._currentRenderer = renderer;
            this._currentRenderer.setProjection(this._projection);
            this._currentRenderer.bind();
        }

        return renderer;
    }

    /**
     * @public
     * @param {?RenderTarget} renderTarget
     */
    setRenderTarget(renderTarget) {
        const newTarget = renderTarget || this._rootRenderTarget;

        if (this._renderTarget !== newTarget) {
            newTarget.setContext(this._context);
            newTarget.bind();

            this._renderTarget = newTarget;
        }
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     */
    resize(width, height) {
        this._canvas.width = width;
        this._canvas.height = height;

        this.updateViewport();
    }

    /**
     * @public
     * @param {View} view
     */
    setView(view) {
        this._view.copy(view);

        this.updateViewport();
    }

    /**
     * @public
     */
    resetView() {
        this._view.reset(Rectangle.Temp.set(0, 0, this._renderTarget.width, this._renderTarget.height));

        this.updateViewport();
    }

    /**
     * @public
     */
    updateViewport() {
        const gl = this._context,
            width = this._renderTarget.width,
            height = this._renderTarget.height,
            viewport = this._view.viewport;

        this._viewport.set(
            (0.5 + (width * viewport.x)) | 0,
            (0.5 + (height * viewport.y)) | 0,
            (0.5 + (width * viewport.width)) | 0,
            (0.5 + (height * viewport.height)) | 0
        );

        gl.viewport(
            this._viewport.x,
            this._viewport.y,
            this._viewport.width,
            this._viewport.height
        );

        this.setProjection(this._view.getTransform());
    }

    /**
     * @public
     * @param {Matrix} projection
     */
    setProjection(projection) {
        this._projection.copy(projection);

        if (this._currentRenderer) {
            this._currentRenderer.setProjection(this._projection);
        }
    }

    /**
     * @public
     * @param {Color} [color=this._clearColor]
     */
    clear(color = this._clearColor) {
        const gl = this._context;

        this.setClearColor(color);

        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /**
     * @public
     * @param {Color} color
     */
    setClearColor(color) {
        if (!this._clearColor.equals(color)) {
            this._clearColor.copy(color);
            this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    begin() {
        if (this._isRendering) {
            throw new Error('Renderer has already begun!');
        }

        this._isRendering = true;

        if (this._clearBeforeRender) {
            this.clear();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {*} renderable
     * @returns {DisplayManager}
     */
    render(renderable) {
        if (!this._isRendering) {
            throw new Error('Renderer needs to begin first!');
        }

        if (!this._contextLost && this.isVisible(renderable)) {
            renderable.render(this);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {DisplayManager}
     */
    end() {
        if (!this._isRendering) {
            throw new Error('Renderer needs to begin first!');
        }

        this._isRendering = false;

        if (!this._contextLost && this._currentRenderer) {
            this._currentRenderer.flush();
        }

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

        this._clearColor.destroy();
        this._clearColor = null;

        this._rootRenderTarget.destroy();
        this._rootRenderTarget = null;

        this._projection.destroy();
        this._projection = null;

        this._viewport.destroy();
        this._viewport = null;

        this._view = null;

        this._clearBeforeRender = null;
        this._isRendering = null;
        this._contextLost = null;
        this._currentRenderer = null;
        this._renderTarget = null;
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
        const gl = this._context,
            blendMode = settings.BLEND_MODE;

        gl.blendFunc(blendMode.src, blendMode.dst);
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
