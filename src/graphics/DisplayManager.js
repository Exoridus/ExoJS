import { BLEND_MODE } from '../const';
import support from '../support';
import RenderTarget from './RenderTarget';
import SpriteRenderer from './sprite/SpriteRenderer';
import ParticleRenderer from '../particles/ParticleRenderer';
import Color from '../core/Color';
import View from './View';
import Rectangle from '../math/Rectangle';
import Vector from '../math/Vector';
import GLProgram from './webgl/GLProgram';
import GLBuffer from './webgl/GLBuffer';
import GLTexture from './webgl/GLTexture';
import GLFramebuffer from './webgl/GLFramebuffer';

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
     * @param {Color} [config.blendMode=settings.BLEND_MODE]
     * @param {Color} [config.clearColor=Color.Black]
     * @param {Boolean} [config.clearBeforeRender=true]
     * @param {Object} [config.contextOptions]
     */
    constructor(app, {
        width = 800,
        height = 600,
        blendMode = BLEND_MODE.NORMAL,
        clearColor = new Color(),
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

        if (this._contextLost) {
            this._restoreContext();
        }

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map([
            ['sprite', new SpriteRenderer()],
            ['particle', new ParticleRenderer()],
        ]);

        /**
         * @private
         * @member {?RenderTarget}
         */
        this._renderTarget = null;

        /**
         * @private
         * @member {?Renderer}
         */
        this._renderer = null;

        /**
         * @private
         * @member {?Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {?BlendMode}
         */
        this._blendMode = null;

        /**
         * @private
         * @member {?Texture}
         */
        this._texture = null;

        /**
         * @private
         * @member {Map<Number, Texture>}
         */
        this._textures = new Map();

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = 0;

        /**
         * @private
         * @member {?View}
         */
        this._view = null;

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new Color();

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
         * @member {RenderTarget}
         */
        this._defaultRenderTarget = new RenderTarget(width, height, true);

        /**
         * @private
         * @member {View}
         */
        this._defaultView = new View(0, 0, width, height);

        this._setupContext();
        this._addEvents();

        this.setRenderTarget(this._defaultRenderTarget);
        this.setView(this._defaultView);
        this.setBlendMode(blendMode);
        this.setClearColor(clearColor);

        this.resize(width, height);
    }

    /**
     * @public
     * @member {WebGLRenderingContext}
     */
    get context() {
        return this._context;
    }

    /**
     * @public
     * @member {?RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    set renderTarget(renderTarget) {
        this.setRenderTarget(renderTarget);
    }

    /**
     * @public
     * @member {?Renderer}
     */
    get renderer() {
        return this._renderer;
    }

    set renderer(renderer) {
        this.setRenderer(renderer);
    }

    /**
     * @public
     * @member {?Shader}
     */
    get shader() {
        return this._shader;
    }

    set shader(shader) {
        this.setShader(shader);
    }

    /**
     * @public
     * @member {BlendMode}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        this.setBlendMode(blendMode);
    }

    /**
     * @public
     * @member {?Texture}
     */
    get texture() {
        return this._textures.get(this._textureUnit) || null;
    }

    set texture(texture) {
        this.setTexture(texture);
    }

    /**
     * @public
     * @member {Number}
     */
    get textureUnit() {
        return this._textureUnit;
    }

    set textureUnit(textureUnit) {
        this.setTextureUnit(textureUnit);
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
     * @member {Boolean}
     */
    get clearBeforeRender() {
        return this._clearBeforeRender;
    }

    set clearBeforeRender(clearBeforeRender) {
        this._clearBeforeRender = clearBeforeRender;
    }

    /**
     * @public
     * @chainable
     * @param {?RenderTarget} renderTarget
     * @returns {DisplayManager}
     */
    setRenderTarget(renderTarget) {
        if (this._renderTarget !== renderTarget) {
            if (this._renderTarget) {
                this._renderTarget.unbind();
            }

            this._renderTarget = renderTarget || null;

            if (this._renderTarget) {
                this._renderTarget.bind(this);
                this._updateViewport();
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Renderer} renderer
     * @returns {DisplayManager}
     */
    setRenderer(renderer) {
        if (this._renderer !== renderer) {
            if (this._renderer) {
                this._renderer.unbind();
            }

            this._renderer = renderer ? renderer.bind(this) : null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Shader} shader
     * @returns {DisplayManager}
     */
    setShader(shader) {
        if (this._shader !== shader) {
            if (this._shader) {
                this._shader.unbind();
            }

            this._shader = shader ? shader.bind(this) : null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {BlendMode} blendMode
     * @returns {DisplayManager}
     */
    setBlendMode(blendMode) {
        if (blendMode !== this._blendMode) {
            const gl = this._context;

            this._blendMode = blendMode;

            gl.blendFunc(blendMode.sFactor, blendMode.dFactor);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?Texture} texture
     * @param {Number} [unit]
     * @returns {DisplayManager}
     */
    setTexture(texture, unit) {
        const currentTexture = this.texture,
            newTexture = texture || null;

        if (currentTexture !== newTexture) {
            if (newTexture) {
                newTexture.bind(this, unit);
                this._textures.set(this._textureUnit, newTexture);
            } else if (currentTexture) {
                currentTexture.unbind();
                this._textures.delete(this._textureUnit);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} unit
     * @returns {DisplayManager}
     */
    setTextureUnit(unit) {
        const textureUnit = unit | 0;

        if (this._textureUnit !== textureUnit) {
            const gl = this._context;

            this._textureUnit = textureUnit;

            gl.activeTexture(gl.TEXTURE0 + textureUnit);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {View} view
     * @returns {DisplayManager}
     */
    setView(view) {
        this._view = view;
        this._updateViewport();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} color
     * @returns {DisplayManager}
     */
    setClearColor(color) {
        if (!this._clearColor.equals(color, true)) {
            const gl = this._context;

            this._clearColor.copy(color);

            gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
        }

        return this;
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
     * @param {Color} [color]
     * @returns {DisplayManager}
     */
    clear(color) {
        const gl = this._context;

        if (color) {
            this.setClearColor(color);
        }

        gl.clear(gl.COLOR_BUFFER_BIT);

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

        this._defaultRenderTarget.resize(width, height);

        if (this._renderTarget === this._defaultRenderTarget) {
            this._updateViewport();
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
            throw new Error('DisplayManager is already rendering!')
        }

        this._isRendering = true;

        if (!this._contextLost && this._clearBeforeRender) {
            this.clear();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Renderable|*} renderable
     * @returns {DisplayManager}
     */
    render(renderable) {
        if (!this._isRendering) {
            throw new Error('DisplayManager has to begin first!')
        }

        if (!this._contextLost) {
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
            throw new Error('DisplayManager has to begin first!')
        }

        this._isRendering = false;

        if (!this._contextLost && this._renderer) {
            this._renderer.flush();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} count
     * @param {ArrayBufferView} data
     * @returns {DisplayManager}
     */
    drawElements(count, data) {
        const gl = this._context;

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

        return this;
    }

    /**
     * @public
     * @param {Renderable|*} renderable
     * @returns {Boolean}
     */
    isVisible(renderable) {
        return renderable.active;
    }

    /**
     * @public
     * @param {Vector} point
     * @param {View} [view=this._view]
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    mapPixelToCoords(point, view = this._view, result = new Vector()) {
        const viewport = view.viewport;

        result.set(
            -1 + (2 * (point.x - viewport.left) / viewport.width),
             1 - (2 * (point.y - viewport.top) / viewport.height)
        );

        return result.transform(view.getInverseTransform());
    }

    /**
     * @public
     * @param {Vector} point
     * @param {View} [view=this._view]
     * @param {Vector} [result=new Vector()]
     * @returns {Vector}
     */
    mapCoordsToPixel(point, view = this._view, result = new Vector()) {
        const viewport = view.viewport;

        point.transform(view.getTransform(), result);

        return result.set(
            ((( result.x + 1) / 2 * viewport.width) + viewport.left) | 0,
            (((-result.y + 1) / 2 * viewport.height) + viewport.top) | 0
        );
    }

    /**
     * @public
     */
    destroy() {
        this._removeEvents();

        this.setRenderTarget(null);
        this.setRenderer(null);
        this.setShader(null);
        this.setView(null);
        this.setTexture(null);

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._renderers = null;

        this._clearColor.destroy();
        this._clearColor = null;

        this._defaultRenderTarget.destroy();
        this._defaultRenderTarget = null;

        this._defaultView.destroy();
        this._defaultView = null;

        this._canvas = null;
        this._context = null;
        this._contextLost = null;
        this._renderTarget = null;
        this._renderer = null;
        this._shader = null;
        this._blendMode = null;
        this._texture = null;
        this._textureUnit = null;
        this._view = null;
        this._clearBeforeRender = null;
        this._isRendering = null;
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
    _restoreContext() {
        const gl = this._context;

        if (gl.getExtension('WEBGL_lose_context')) {
            gl.getExtension('WEBGL_lose_context').restoreContext();
        }
    }

    /**
     * @private
     */
    _setupContext() {
        const gl = this._context;

        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.colorMask(true, true, true, false);
    }

    /**
     * @private
     * @chainable
     * @returns {DisplayManager}
     */
    _updateViewport() {
        if (this._renderTarget && this._view) {
            const gl = this._context,
                size = this._renderTarget.size,
                viewport = this._view.viewport;

            gl.viewport(
                Math.round(size.width * viewport.x),
                Math.round(size.height * viewport.y),
                Math.round(size.width * viewport.width),
                Math.round(size.height * viewport.height)
            );
        }

        return this;
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

        this._restoreContext();
    }

    /**
     * @private
     */
    _onContextRestored() {
        this._contextLost = false;
    }
}
