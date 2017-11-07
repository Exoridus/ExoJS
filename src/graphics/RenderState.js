import Color from '../core/Color';
import GLTexture from './webgl/GLTexture';
import settings from '../settings';
import GLBuffer from './webgl/GLBuffer';
import GLFramebuffer from './webgl/GLFramebuffer';
import GLProgram from './webgl/GLProgram';
import View from './View';

/**
 * @class RenderState
 */
export default class RenderState {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     */
    constructor(context) {
        if (!context) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

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
         * @member {?View}
         */
        this._view = null;

        /**
         * @private
         * @member {?Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {?GLFramebuffer}
         */
        this._glFramebuffer = null;

        /**
         * @private
         * @member {?GLProgram}
         */
        this._glProgram = null;

        /**
         * @private
         * @member {?GLBuffer}
         */
        this._glBuffer = null;

        /**
         * @private
         * @member {?GLTexture}
         */
        this._glTexture = null;

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = -1;

        /**
         * @private
         * @member {Object}
         */
        this._blendMode = settings.BLEND_MODE;

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new Color();

        this._setupContext(context);
    }

    /**
     * @public
     * @member {?Renderer}
     */
    get renderer() {
        return this._renderer;
    }

    set renderer(renderer) {
        if (this._renderer !== renderer) {
            if (this._renderer) {
                this._renderer.unbind();
            }

            this._renderer = renderer ? renderer.bind(this) : null;
        }
    }

    /**
     * @public
     * @member {?RenderTarget}
     */
    get renderTarget() {
        return this._renderTarget;
    }

    set renderTarget(renderTarget) {
        if (this._renderTarget !== renderTarget) {
            if (this._renderTarget) {
                this._renderTarget.unbind();
            }

            this._renderTarget = renderTarget ? renderTarget.bind(this) : null;
            this.updateViewport();
        }
    }

    /**
     * @public
     * @member {?View}
     */
    get view() {
        return this._view;
    }

    set view(view) {
        this._view = view;
        this.updateViewport();
    }

    /**
     * @public
     * @member {?Shader}
     */
    get shader() {
        return this._shader;
    }

    set shader(shader) {
        if (this._shader !== shader) {
            if (this._shader) {
                this._shader.unbind();
            }

            this._shader = shader ? shader.bind(this) : null;
        }
    }

    /**
     * @public
     * @member {?GLFramebuffer}
     */
    get glFramebuffer() {
        return this._glFramebuffer;
    }

    set glFramebuffer(glFramebuffer) {
        if (this._glFramebuffer !== glFramebuffer) {
            if (glFramebuffer) {
                this._glFramebuffer = glFramebuffer.bind();
            } else if (this._glFramebuffer) {
                this._glFramebuffer.unbind();
                this._glFramebuffer = null;
            }
        }
    }

    /**
     * @public
     * @member {?GLProgram}
     */
    get glProgram() {
        return this._glProgram;
    }

    set glProgram(glProgram) {
        if (this._glProgram !== glProgram) {
            if (this._glProgram) {
                this._glProgram.unbind();
            }

            this._glProgram = glProgram ? glProgram.bind(this) : null;
        }
    }

    /**
     * @public
     * @member {?GLBuffer}
     */
    get glBuffer() {
        return this._glBuffer;
    }

    set glBuffer(glBuffer) {
        if (this._glBuffer !== glBuffer) {
            if (glBuffer) {
                this._glBuffer = glBuffer.bind();
            } else if (this._glBuffer) {
                this._glBuffer.unbind();
                this._glBuffer = null;
            }
        }
    }

    /**
     * @public
     * @member {?GLTexture}
     */
    get glTexture() {
        return this._glTexture;
    }

    set glTexture(glTexture) {
        if (this._glTexture !== glTexture) {
            if (glTexture) {
                this._glTexture = glTexture.bind();
            } else if (this._glTexture) {
                this._glTexture.unbind();
                this._glTexture = null;
            }
        }
    }

    /**
     * @public
     * @member {?BlendMode}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        if (blendMode && blendMode !== this._blendMode) {
            this._context.blendFunc(blendMode.sFactor, blendMode.dFactor);
            this._blendMode = blendMode;
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get textureUnit() {
        return this._textureUnit;
    }

    set textureUnit(value) {
        const textureUnit = value | 0;

        if (textureUnit !== this._textureUnit) {
            const gl = this._context;

            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            this._textureUnit = textureUnit;
        }
    }

    /**
     * @public
     * @member {Color}
     */
    get clearColor() {
        return this._clearColor;
    }

    set clearColor(color) {
        if (color && !this._clearColor.equals(color, true)) {
            this._context.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
            this._clearColor.copy(color);
        }
    }

    /**
     * @public
     * @param {String} vertexSource
     * @param {String} fragmentSource
     * @returns {GLProgram}
     */
    createGLProgram(vertexSource, fragmentSource) {
        return new GLProgram(this._context, vertexSource, fragmentSource);
    }

    /**
     * @public
     * @param {Number} size
     * @param {Number} attributeCount
     * @returns {GLBuffer}
     */
    createGLBuffer(size, attributeCount) {
        return new GLBuffer(this._context, size, attributeCount);
    }

    /**
     * @public
     * @returns {GLTexture}
     */
    createGLTexture() {
        return new GLTexture(this._context);
    }

    /**
     * @public
     * @param {Boolean} isRoot
     * @returns {?GLFramebuffer}
     */
    createGLFramebuffer(isRoot) {
        return new GLFramebuffer(this._context, isRoot);
    }

    /**
     * @public
     * @chainable
     * @param {Color} [color]
     * @returns {RenderState}
     */
    clear(color) {
        const gl = this._context;

        if (color !== undefined) {
            this.clearColor = color;
        }

        gl.clear(gl.COLOR_BUFFER_BIT);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {RenderState}
     */
    updateViewport() {
        if (this._view && this._renderTarget) {
            const width = this._renderTarget.width,
                height = this._renderTarget.height,
                viewport = this._view.viewport;

            this._context.viewport(
                Math.round(width * viewport.x),
                Math.round(height * viewport.y),
                Math.round(width * viewport.width),
                Math.round(height * viewport.height)
            );
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} count
     * @param {ArrayBufferView} data
     * @returns {RenderState}
     */
    drawElements(count, data) {
        const gl = this._context;

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.renderer = null;
        this.renderTarget = null;
        this.view = null;
        this.shader = null;
        this.glFramebuffer = null;
        this.glProgram = null;
        this.glBuffer = null;
        this.glTexture = null;

        this._clearColor.destroy();
        this._clearColor = null;

        this._textureUnit = null;
        this._blendMode = null;
        this._context = null;
    }

    /**
     * @public
     * @param {WebGLRenderingContext}
     */
    _setupContext(gl) {
        const blendMode = this._blendMode;

        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.colorMask(true, true, true, false);
        gl.blendFunc(blendMode.sFactor, blendMode.dFactor);
    }
}
