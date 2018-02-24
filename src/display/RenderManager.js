import { BLEND_MODES, TYPES } from '../const';
import RenderTarget from './RenderTarget';
import Color from '../types/Color';
import Texture from './Texture';
import SpriteRenderer from './sprite/SpriteRenderer';
import ShapeRenderer from './shape/ShapeRenderer';
import RenderTexture from './RenderTexture';
import VertexArray from './VertexArray';
import { createQuadIndices } from '../utils/rendering';
import Buffer from './Buffer';

/**
 * @class RenderManager
 */
export default class RenderManager {

    /**
     * @constructor
     * @param {Screen} screen
     */
    constructor(screen) {

        /**
         * @private
         * @member {Screen}
         */
        this._screen = screen;

        /**
         * @private
         * @member {HTMLCanvasElement}
         */
        this._canvas = screen.canvas;

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = screen.context;

        /**
         * @private
         * @member {Map<String, Renderer>}
         */
        this._renderers = new Map();

        /**
         * @private
         * @member {?Renderer}
         */
        this._renderer = null;

        /**
         * @private
         * @member {?RenderTarget}
         */
        this._renderTarget = null;

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
         * @member {?Texture|?RenderTexture}
         */
        this._texture = null;

        /**
         * @private
         * @member {?VertexArray}
         */
        this._vao = null;

        /**
         * @private
         * @member {RenderTexture[]}
         */
        this._filterTextures = [
            new RenderTexture(100, 100),
            new RenderTexture(100, 100),
        ];

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._filterData = new ArrayBuffer(48);

        /**
         * @private
         * @member {Buffer}
         */
        this._filterVertexBuffer = Buffer.createVertexBuffer(this._context, this._filterData);

        /**
         * @private
         * @member {Buffer}
         */
        this._filterIndexBuffer = Buffer.createIndexBuffer(this._context, createQuadIndices(1));

        /**
         * @private
         * @member {Float32Array}
         */
        this._filterVertices = new Float32Array(this._filterData);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._filterTexCoords = new Uint32Array(this._filterData);

        /**
         * @private
         * @member {VertexArray}
         */
        this._filterVAO = new VertexArray(this._context)
            .addAttribute(this._filterVertexBuffer, 0, TYPES.FLOAT, 2, false)
            .addAttribute(this._filterVertexBuffer, 1, TYPES.UNSIGNED_SHORT, 2, true)
            .addIndex(this._filterIndexBuffer);

        this.addRenderer('sprite', new SpriteRenderer());
        this.addRenderer('shape', new ShapeRenderer());

        this.setBlendMode(BLEND_MODES.NORMAL);
        this.setRenderTarget(this._screen.renderTarget);
    }

    /**
     * @public
     * @member {WebGL2RenderingContext}
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
     * @member {?View}
     */
    get view() {
        return this._renderTarget ? this._renderTarget.view : null;
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
     * @member {?VertexArray}
     */
    get vao() {
        return this._vao;
    }

    set vao(vao) {
        this.setVAO(vao);
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
     * @chainable
     * @param {?RenderTarget|?RenderTexture} renderTarget
     * @returns {RenderManager}
     */
    setRenderTarget(target) {
        const renderTarget = target || this._screen.renderTarget;

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
     * @param {VertexArray} vao
     * @returns {RenderManager}
     */
    setVAO(vao) {
        const newVao = vao || null;

        if (this._vao !== newVao) {
            if (newVao) {
                newVao.bind();
            }

            if (this._vao) {
                this._vao.unbind();
            }

            this._vao = newVao;
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
        this._renderTarget.clear(color);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Drawable|*} drawable
     * @returns {RenderManager}
     */
    draw(drawable) {
        if (!this._screen.contextLost) {
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
        if (this._renderer && !this._screen.contextLost) {
            this._renderer.flush();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @param {Shader[]} filters
     * @returns {RenderTexture}
     */
    applyTextureFilters(texture, filters) {
        const lastTarget = this.renderTarget,
            lastShader = this.shader,
            lastVAO = this.vao,
            len = filters.length;

        this.setTexture(texture);

        for (let i = 0; i < len; i++) {
            const filterTexture = this._filterTextures[i % 2];

            this.setRenderTarget(filterTexture.setSize(texture.width, texture.height));
            this.setShader(filters[i]);
            this.setVAO(this._filterVAO);

            this._filterVAO.draw(6, 0);

            this.setTexture(filterTexture);
        }

        this.setRenderTarget(lastTarget);
        this.setShader(lastShader);
        this.setVAO(lastVAO);

        return this._texture;
    }

    /**
     * @public
     */
    destroy() {
        this.setRenderTarget(null);
        this.setRenderer(null);
        this.setVAO(null);
        this.setShader(null);
        this.setTexture(null);

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._renderers = null;

        this._screen.destroy();
        this._screen = null;

        this._vao = null;
        this._canvas = null;
        this._context = null;
        this._renderTarget = null;
        this._renderer = null;
        this._shader = null;
        this._blendMode = null;
        this._texture = null;
        this._textureUnit = null;
    }
}
