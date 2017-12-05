import { BLEND_MODES } from '../const';
import support from '../support';
import settings from '../settings';
import RenderTarget from './RenderTarget';
import SpriteRenderer from './sprite/SpriteRenderer';
import ParticleRenderer from '../particles/ParticleRenderer';
import Color from '../core/Color';
import { imageToBase64 } from '../utils';

/**
 * @class RenderManager
 */
export default class RenderManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {
        if (!support.webGL) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        const { width, height, clearColor } = app.config;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = app.canvas;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = this._createContext();

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
        this._renderers = new Map();

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
         * @member {?Buffer}
         */
        this._buffer = null;

        /**
         * @private
         * @member {?Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {?Number}
         */
        this._blendMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = 0;

        /**
         * @private
         * @member {?Texture}
         */
        this._texture = null;

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = (clearColor && clearColor.clone()) || new Color();

        /**
         * @private
         * @member {Boolean}
         */
        this._clearAlpha = (this._clearColor.a < 1);

        /**
         * @private
         * @member {RenderTarget}
         */
        this._rootRenderTarget = new RenderTarget(width, height, true);

        /**
         * @private
         * @member {String}
         */
        this._cursor = this._canvas.style.cursor;

        this._setupContext();
        this._addEvents();

        this.addRenderer('sprite', new SpriteRenderer());
        this.addRenderer('particle', new ParticleRenderer());

        this.setRenderTarget(this._rootRenderTarget);
        this.setBlendMode(BLEND_MODES.NORMAL);

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
     * @readonly
     * @member {?RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    /**
     * @public
     * @readonly
     * @member {?Texture}
     */
    get texture() {
        return this._texture;
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
     * @member {?Buffer}
     */
    get buffer() {
        return this._buffer;
    }

    set buffer(buffer) {
        this.setBuffer(buffer);
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
     * @param {?RenderTarget|?RenderTexture} renderTarget
     * @returns {RenderManager}
     */
    setRenderTarget(target) {
        const renderTarget = target || this._rootRenderTarget;

        if (this._renderTarget !== renderTarget) {
            if (this._renderTarget) {
                this._renderTarget.unbindFramebuffer();
                this._renderTarget = null;
            }

            if (renderTarget) {
                renderTarget.connect(this._context);
                renderTarget.bindFramebuffer();
            }

            this._renderTarget = renderTarget;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Renderer} renderer
     * @returns {RenderManager}
     */
    setRenderer(renderer) {
        const newRenderer = renderer || null;

        if (this._renderer !== newRenderer) {
            if (this._renderer) {
                this._renderer.unbind();
                this._renderer = null;
            }

            if (newRenderer) {
                newRenderer.connect(this);
                newRenderer.bind();
            }

            this._renderer = newRenderer;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?Buffer} buffer
     * @returns {RenderManager}
     */
    setBuffer(buffer) {
        const newBuffer = buffer || null;

        if (this._buffer !== newBuffer) {
            if (this._buffer) {
                this._buffer.unbindBuffers();
                this._buffer = null;
            }

            if (newBuffer) {
                newBuffer.connect(this._context);
                newBuffer.bindBuffers();
            }

            this._buffer = newBuffer;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?Shader} shader
     * @returns {RenderManager}
     */
    setShader(shader) {
        const newShader = shader || null;

        if (this._shader !== newShader) {
            if (this._shader) {
                this._shader.unbindProgram();
                this._shader = null;
            }

            if (newShader) {
                newShader.connect(this._context);
                newShader.bindProgram();
            }

            this._shader = newShader;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?Texture|?RenderTexture} texture
     * @param {Number} [unit]
     * @returns {RenderManager}
     */
    setTexture(texture, unit) {
        const newTexture = texture || null;

        if (unit !== undefined) {
            this.setTextureUnit(unit);
        }

        if (this._texture !== newTexture) {
            if (this._texture) {
                this._texture.unbindTexture();
                this._texture = null;
            }

            if (newTexture) {
                newTexture.connect(this._context);
                newTexture.bindTexture();
            }

            this._texture = newTexture;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} blendMode
     * @returns {RenderManager}
     */
    setBlendMode(blendMode) {
        if (blendMode !== this._blendMode) {
            const gl = this._context;

            this._blendMode = blendMode;

            switch (blendMode) {
                case BLEND_MODES.ADD:
                    gl.blendFunc(gl.ONE, gl.ONE);
                    break;
                case BLEND_MODES.SUBTRACT:
                    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                    break;
                case BLEND_MODES.MULTIPLY:
                    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                    break;
                case BLEND_MODES.SCREEN:
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                    break;
                default:
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                    break;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} unit
     * @returns {RenderManager}
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
     * @param {Color} color
     * @returns {RenderManager}
     */
    setClearColor(color) {
        if (!this._clearColor.equals(color)) {
            const gl = this._context,
                clearAlpha = (color.a < 1);

            this._clearColor.copy(color);

            gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);

            if (this._clearAlpha !== clearAlpha) {
                this._clearAlpha = clearAlpha;

                gl.colorMask(true, true, true, clearAlpha);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String|HTMLImageElement|Texture} cursor
     * @returns {RenderManager}
     */
    setCursor(cursor) {
        if (cursor !== this._cursor) {
            if (cursor instanceof Texture) {
                cursor = cursor.source;
            }

            if (cursor instanceof HTMLImageElement) {
                cursor = `url(${imageToBase64(cursor)})`;
            }

            this._canvas.style.cursor = this._cursor = cursor;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {SpriteRenderer|ParticleRenderer|Renderer} renderer
     * @returns {RenderManager}
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
     * @returns {RenderManager}
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
     * @returns {RenderManager}
     */
    resize(width, height) {
        this._canvas.width = width;
        this._canvas.height = height;

        this._rootRenderTarget.resize(width, height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Drawable|*} drawable
     * @returns {RenderManager}
     */
    draw(drawable) {
        if (!this._contextLost) {
            drawable.render(this);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderManager}
     */
    display() {
        if (this._renderer && !this._contextLost) {
            this._renderer.flush();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} count
     * @returns {RenderManager}
     */
    drawElements(count) {
        const gl = this._context;

        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

        return this;
    }

    /**
     * @public
     * @param {Drawable} drawable
     * @param {View} [view=this._renderTarget.view]
     * @returns {Boolean}
     */
    insideViewport(drawable, view = this._renderTarget.view) {
        return view.getBounds().intersets(drawable.getBounds());
    }

    /**
     * @public
     */
    destroy() {
        this._removeEvents();

        this.setRenderTarget(null);
        this.setRenderer(null);
        this.setShader(null);
        this.setBuffer(null);
        this.setTexture(null);

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._renderers = null;

        this._clearColor.destroy();
        this._clearColor = null;

        this._rootRenderTarget.destroy();
        this._rootRenderTarget = null;

        this._canvas = null;
        this._context = null;
        this._contextLost = null;
        this._renderTarget = null;
        this._renderer = null;
        this._buffer = null;
        this._shader = null;
        this._blendMode = null;
        this._texture = null;
        this._textureUnit = null;
        this._clearAlpha = null;
        this._cursor = null;
    }

    /**
     * @private
     * @returns {?WebGLRenderingContext|?WebGL2RenderingContext}
     */
    _createContext(options = settings.CONTEXT_OPTIONS) {
        try {
            return this._canvas.getContext('webgl2', options) || this._canvas.getContext('webgl', options);
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
        const gl = this._context,
            { r, g, b, a } = this._clearColor;

        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.blendEquation(gl.FUNC_ADD);
        gl.clearColor(r / 255, g / 255, b / 255, a);
        gl.colorMask(true, true, true, this._clearAlpha);
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
