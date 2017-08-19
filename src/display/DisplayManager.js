import RenderTarget from './RenderTarget';
import BlendModes from './constants/BlendModes';
import SpriteRenderer from './sprite/SpriteRenderer';
import ParticleRenderer from './particle/ParticleRenderer';
import Matrix from '../core/Matrix';

/**
 * @class DisplayManager
 * @memberof Exo
 */
export default class DisplayManager {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    constructor(game) {
        const config = game.config;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = this._createContext(config.contextOptions);

        if (!this._context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {Exo.Color}
         */
        this._clearColor = config.clearColor.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._clearBeforeRender = config.clearBeforeRender;

        /**
         * @private
         * @member {Boolean}
         */
        this._isDrawing = false;

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {Exo.Renderer|null}
         */
        this._currentRenderer = null;

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._worldTransform = new Matrix();

        /**
         * @private
         * @member {Boolean}
         */
        this._contextLost = false;

        /**
         * @private
         * @member {Exo.RenderTarget}
         */
        this._rootRenderTarget = new RenderTarget(config.width, config.height, true);

        /**
         * @private
         * @member {Exo.RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {Exo.BlendMode|null}
         */
        this._blendMode = null;

        /**
         * @private
         * @member {Exo.Shader|null}
         */
        this._shader = null;

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._projection = new Matrix();

        this._addEvents();
        this._setGLFlags();

        this.setBlendMode(BlendModes.Default);
        this.setClearColor(this._clearColor);
        this.setRenderTarget(this._rootRenderTarget);

        this.addRenderer('sprite', new SpriteRenderer());
        this.addRenderer('particle', new ParticleRenderer());
        this.setCurrentRenderer('sprite');

        this.resize(config.width, config.height);

        game.on('display:begin', this.onBegin, this)
            .on('display:render', this.onRender, this)
            .on('display:end', this.onEnd, this)
            .on('display:clear', this.onClear, this)
            .on('display:resize', this.resize, this);
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
     * @member {Exo.RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    set renderTarget(value) {
        this.setRenderTarget(value);
    }

    /**
     * @public
     * @member {Exo.BlendMode}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(value) {
        this.setBlendMode(value);
    }

    /**
     * @public
     * @member {Exo.Color}
     */
    get clearColor() {
        return this._clearColor;
    }

    set clearColor(value) {
        this.setClearColor(value);
    }

    /**
     * @public
     * @param {String} name
     * @param {Exo.Renderer} renderer
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
     * @returns {Exo.Renderer}
     */
    getRenderer(name) {
        if (!this._renderers.has(name)) {
            throw new Error(`Could not find renderer "${name}".`);
        }

        return this._renderers.get(name);
    }

    /**
     * @public
     * @param {String} name
     */
    removeRenderer(name) {
        if (this._renderers.has(name)) {
            this._renderers.get(name).destroy();
            this._renderers.delete(name);
        }
    }

    /**
     * @public
     * @param {String} name
     */
    setCurrentRenderer(name) {
        const renderer = this.getRenderer(name),
            currentRenderer = this._currentRenderer;

        if (currentRenderer === renderer) {
            return;
        }

        if (currentRenderer) {
            currentRenderer.stop();
        }

        this._currentRenderer = renderer;
        renderer.start(this);
    }

    /**
     * @public
     * @returns {Exo.Renderer|null}
     */
    getCurrentRenderer() {
        return this._currentRenderer;
    }

    /**
     * @public
     * @param {Exo.RenderTarget|null} renderTarget
     */
    setRenderTarget(renderTarget) {
        const newTarget = renderTarget || this._rootRenderTarget;

        if (this._renderTarget === newTarget) {
            return;
        }

        newTarget.setContext(this._context);
        newTarget.bind();

        this._renderTarget = newTarget;
    }

    /**
     * @public
     * @param {Exo.BlendMode} blendMode
     */
    setBlendMode(blendMode) {
        if (blendMode !== this._blendMode) {
            this._blendMode = blendMode;
            this._context.blendFunc(blendMode.sFactor, blendMode.dFactor);
        }
    }

    /**
     * @public
     * @param {Exo.Shader} shader
     */
    setShader(shader) {
        const gl = this._context,
            currentShader = this._shader;

        if (currentShader === shader) {
            return;
        }

        if (currentShader) {
            currentShader.inUse = false;
        }

        shader.setContext(gl);
        shader.setProjection(this._projection);
        shader.bind();

        this._shader = shader;
    }

    /**
     * @public
     * @param {Number} width
     * @param {Number} height
     */
    resize(width, height) {
        this._canvas.width = width;
        this._canvas.height = height;

        this._rootRenderTarget.resize(width, height);
        this._projection.copy(this._rootRenderTarget.getProjection());

        if (this._shader) {
            this._shader.setProjection(this._projection);
        }
    }

    /**
     * @public
     * @param {Exo.View} view
     */
    setView(view) {
        this._renderTarget.setView(view);

        if (this._renderTarget === this._rootRenderTarget) {
            this._projection.copy(this._rootRenderTarget.getProjection());
            this._shader.setProjection(this._projection);
        }
    }

    /**
     * @private
     * @param {Exo.Color} color
     */
    onClear(color) {
        const gl = this._context;

        if (color) {
            this.setClearColor(color);
        }

        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /**
     * @private
     */
    onBegin() {
        if (this._isDrawing) {
            throw new Error('Renderer has already begun!');
        }

        this._isDrawing = true;

        if (this._clearBeforeRender) {
            this.onClear();
        }
    }

    /**
     * @private
     * @param {Exo.Drawable|Object} drawable
     */
    onRender(drawable) {
        if (!this._isDrawing) {
            throw new Error('Renderer needs to begin first!');
        }

        if (!this._contextLost) {
            drawable.draw(this, this._worldTransform);
        }
    }

    /**
     * @private
     */
    onEnd() {
        if (!this._isDrawing) {
            throw new Error('Renderer needs to begin first!');
        }

        this._isDrawing = false;

        if (!this._contextLost) {
            this._currentRenderer.flush();
        }
    }

    /**
     * @param {Exo.Color} color
     */
    setClearColor(color) {
        this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    /**
     * @public
     */
    destroy() {
        this._removeEvents();

        this._renderers.forEach((renderer, name) => {
            this.removeRenderer(name);
        });

        this._canvas = null;
        this._context = null;
        this._clearColor = null;
        this._renderers = null;
        this._currentRenderer = null;
        this._worldTransform = null;
    }

    /**
     * @override
     */
    _createContext(contextOptions) {
        const opts = Object.assign({
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            stencil: true,
            depth: false,
        }, contextOptions);

        try {
            return (this._canvas.getContext('webgl', opts) || this._canvas.getContext('experimental-webgl', opts));
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
    _setGLFlags() {
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
