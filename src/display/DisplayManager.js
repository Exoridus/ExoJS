import RenderTarget from './RenderTarget';
import SpriteRenderer from './sprite/SpriteRenderer';
import ParticleRenderer from './particle/ParticleRenderer';
import Color from '../core/Color';
import Matrix from '../core/Matrix';
import {webGLSupported} from '../utils';
import {BLEND_MODE} from '../const';
import BlendMode from './BlendMode';

/**
 * @class DisplayManager
 * @memberof Exo
 */
export default class DisplayManager {

    /**
     * @constructor
     * @param {Exo.Game} game
     * @param {Object} [config={}]
     * @param {Number} [config.width=800]
     * @param {Number} [config.height=600]
     * @param {Exo.Color} [config.clearColor=Exo.Color.White]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    constructor(game, { width = 800, height = 600, clearColor = Color.White, clearBeforeRender = true, contextOptions } = {}) {
        if (!webGLSupported) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = game.canvas;

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
         * @member {Exo.Color}
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
        this._isDrawing = false;

        /**
         * @private
         * @member {Map<String, Exo.Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?Exo.Renderer}
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
        this._rootRenderTarget = new RenderTarget(width, height, true);

        /**
         * @private
         * @member {?Exo.RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {Map<Number, Exo.BlendMode>}
         */
        this._blendModes = this._createBlendModes(this._context);

        /**
         * @private
         * @member {?Number}
         */
        this._currentBlendMode = null;

        /**
         * @private
         * @member {Exo.Matrix}
         */
        this._projection = new Matrix();

        this._addEvents();
        this._setGLFlags();

        this.setBlendMode(BLEND_MODE.SOURCE_OVER);
        this.setClearColor(this._clearColor);
        this.setRenderTarget(this._rootRenderTarget);

        this.addRenderer('sprite', new SpriteRenderer());
        this.addRenderer('particle', new ParticleRenderer());

        this.resize(width, height);

        game.on('display:begin', this.begin, this)
            .on('display:render', this.render, this)
            .on('display:end', this.end, this)
            .on('display:clear', this.clear, this)
            .on('display:resize', this.resize, this)
            .on('display:view', this.setView, this);
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
     * @member {Number}
     */
    get currentBlendMode() {
        return this._currentBlendMode;
    }

    set currentBlendMode(value) {
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
     * @param {Exo.SpriteRenderer|Exo.ParticleRenderer|Exo.Renderer} renderer
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
     * @param {?Exo.RenderTarget} renderTarget
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
     * @param {Number} blendMode
     */
    setBlendMode(blendMode) {
        if (!this._blendModes.has(blendMode)) {
            throw new Error(`Blendmode "${blendMode}" is not supported.`);
        }

        if (blendMode !== this._currentBlendMode) {
            const blending = this._blendModes.get(blendMode);

            this._currentBlendMode = blendMode;
            this._context.blendFunc(blending.sFactor, blending.dFactor);
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

        this._rootRenderTarget.resize(width, height);
        this.setProjection(this._rootRenderTarget.getProjection());
    }

    /**
     * @public
     * @param {Exo.View} view
     */
    setView(view) {
        this._renderTarget.setView(view);

        if (this._renderTarget === this._rootRenderTarget) {
            this.setProjection(this._rootRenderTarget.getProjection());
        }
    }

    /**
     * @public
     * @param {Exo.Matrix} projection
     */
    setProjection(projection) {
        this._projection.copy(projection);

        if (this._currentRenderer) {
            this._currentRenderer.setProjection(this._projection);
        }
    }

    /**
     * @public
     * @param {Exo.Color} [color=this._clearColor]
     */
    clear(color = this._clearColor) {
        const gl = this._context;

        if (color) {
            this.setClearColor(color);
        }

        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /**
     * @public
     * @param {Exo.Color} color
     */
    setClearColor(color) {
        if (!this._clearColor.equals(color)) {
            this._clearColor.copy(color);
            this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
        }
    }

    /**
     * @public
     */
    begin() {
        if (this._isDrawing) {
            throw new Error('Renderer has already begun!');
        }

        this._isDrawing = true;

        if (this._clearBeforeRender) {
            this.clear();
        }
    }

    /**
     * @public
     * @param {*} renderable
     */
    render(renderable) {
        if (!this._isDrawing) {
            throw new Error('Renderer needs to begin first!');
        }

        if (!this._contextLost) {
            renderable.render(this, this._worldTransform);
        }
    }

    /**
     * @public
     */
    end() {
        if (!this._isDrawing) {
            throw new Error('Renderer needs to begin first!');
        }

        this._isDrawing = false;

        if (this._currentRenderer && !this._contextLost) {
            this._currentRenderer.flush();
        }
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
        this._renderers = null

        this._clearColor.destroy();
        this._clearColor = null;

        this._worldTransform.destroy();
        this._worldTransform = null;

        this._currentRenderer = null;
        this._context = null;
        this._canvas = null;
    }

    /**
     * @override
     */
    _createContext({ alpha = false, antialias = false, premultipliedAlpha = false, preserveDrawingBuffer = false, stencil = true, depth = false } = {}) {
        try {
            return this._canvas.getContext('webgl', {
                alpha,
                antialias,
                premultipliedAlpha,
                preserveDrawingBuffer,
                stencil,
                depth,
            }) || this._canvas.getContext('experimental-webgl', {
                alpha,
                antialias,
                premultipliedAlpha,
                preserveDrawingBuffer,
                stencil,
                depth,
            });
        } catch (e) {
            return null;
        }
    }

    /**
     * @override
     */
    _createBlendModes(gl) {
        const one = gl.ONE,
            srcAlpha = gl.SRC_ALPHA,
            dstAlpha = gl.DST_ALPHA,
            oneMinusSrcAlpha = gl.ONE_MINUS_SRC_ALPHA;

        return new Map([
            [BLEND_MODE.SOURCE_OVER, new BlendMode(one, oneMinusSrcAlpha, 'source-over')],
            [BLEND_MODE.ADD, new BlendMode(srcAlpha, dstAlpha, 'lighter')],
            [BLEND_MODE.MULTIPLY, new BlendMode(dstAlpha, oneMinusSrcAlpha, 'multiply')],
            [BLEND_MODE.SCREEN, new BlendMode(srcAlpha, one, 'screen')],
            [BLEND_MODE.OVERLAY, new BlendMode(one, oneMinusSrcAlpha, 'overlay')],
            [BLEND_MODE.DARKEN, new BlendMode(one, oneMinusSrcAlpha, 'darken')],
            [BLEND_MODE.LIGHTEN, new BlendMode(one, oneMinusSrcAlpha, 'lighten')],
            [BLEND_MODE.COLOR_DODGE, new BlendMode(one, oneMinusSrcAlpha, 'color-dodge')],
            [BLEND_MODE.COLOR_BURN, new BlendMode(one, oneMinusSrcAlpha, 'color-burn')],
            [BLEND_MODE.HARD_LIGHT, new BlendMode(one, oneMinusSrcAlpha, 'hard-light')],
            [BLEND_MODE.SOFT_LIGHT, new BlendMode(one, oneMinusSrcAlpha, 'soft-light')],
            [BLEND_MODE.DIFFERENCE, new BlendMode(one, oneMinusSrcAlpha, 'difference')],
            [BLEND_MODE.EXCLUSION, new BlendMode(one, oneMinusSrcAlpha, 'exclusion')],
            [BLEND_MODE.HUE, new BlendMode(one, oneMinusSrcAlpha, 'hue')],
            [BLEND_MODE.SATURATION, new BlendMode(one, oneMinusSrcAlpha, 'saturation')],
            [BLEND_MODE.COLOR, new BlendMode(one, oneMinusSrcAlpha, 'color')],
            [BLEND_MODE.LUMINOSITY, new BlendMode(one, oneMinusSrcAlpha, 'luminosity')],
        ]);
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
