import { UNIFORM_TYPE } from '../const';
import RenderTarget from './RenderTarget';
import Color from '../core/Color';
import Matrix from '../math/Matrix';
import Rectangle from '../math/Rectangle';
import GLTexture from './GLTexture';
import settings from '../settings';

/**
 * @class RenderState
 */
export default class RenderState {

    /**
     * @constructs RenderState
     * @param {WebGLRenderingContext} context
     */
    constructor(gl) {
        if (!gl) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = gl;

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
         * @member {Object}
         */
        this._blendMode = settings.BLEND_MODE;

        /**
         * @private
         * @member {Color}
         */
        this._clearColor = new Color();

        /**
         * @private
         * @member {?WebGLFramebuffer}
         */
        this._glFramebuffer = null;

        /**
         * @private
         * @member {WeakMap<RenderTarget, WebGLFramebuffer>}
         */
        this._glFramebuffers = new WeakMap();

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = -1;

        /**
         * @private
         * @member {?GLTexture}
         */
        this._glTexture = null;

        /**
         * @private
         * @member {WeakMap<Texture, GLTexture>}
         */
        this._glTextures = new WeakMap();

        /**
         * @private
         * @member {Rectangle}
         */
        this._viewport = new Rectangle();

        /**
         * @private
         * @member {Matrix}
         */
        this._projection = new Matrix();

        gl.enable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);

        gl.colorMask(true, true, true, false);
        gl.blendFunc(this._blendMode.src, this._blendMode.dst);
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
            this._context.blendFunc(blendMode.src, blendMode.dst);
            this._blendMode = blendMode;
        }
    }

    /**
     * @public
     * @member {?Shader}
     */
    get shader() {
        return this._shader;
    }

    set shader(shader) {
        if (shader && shader !== this._shader) {
            if (this._shader) {
                this._shader.unbind();
            }

            this._shader = shader;
            this._shader.bind(this);
        }
    }

    /**
     * @public
     * @member {?Renderer}
     */
    get renderer() {
        return this._renderer;
    }

    set renderer(renderer) {
        if (renderer && renderer !== this._renderer) {
            if (this._renderer) {
                this._renderer.unbind();
            }

            this._renderer = renderer;
            this._renderer.bind(this);
            this._renderer.setProjection(this._projection);
        }
    }

    /**
     * @public
     * @member {?WebGLFramebuffer}
     */
    get glFramebuffer() {
        return this._glFramebuffer;
    }

    set glFramebuffer(value) {
        const gl = this._context,
            glFramebuffer = value || null;

        if (glFramebuffer !== this._glFramebuffer) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);
            this._glFramebuffer = glFramebuffer;
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
        if (glTexture && glTexture !== this._glTexture) {
            this._glTexture = glTexture.bind();
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
     * @member {Rectangle}
     */
    get viewport() {
        return this._viewport;
    }

    set viewport(viewport) {
        if (viewport && !viewport.equals(this._viewport)) {
            this._context.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            this._viewport.copy(viewport);
        }
    }

    /**
     * @public
     * @member {Matrix}
     */
    get projection() {
        return this._projection;
    }

    set projection(projection) {
        this._projection.copy(projection);

        if (this._renderer) {
            this._renderer.setProjection(projection);
        }
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
     * @param {RenderTarget} renderTarget
     * @param {Number} [unit}
     */
    bindRenderTarget(renderTarget) {
        this.glFramebuffer = this.getGLFramebuffer(renderTarget);

        return this;
    }

    /**
     * @public
     * @param {RenderTarget} renderTarget
     * @returns {RenderState}
     */
    removeRenderTarget(renderTarget) {
        if (this._glFramebuffers.has(renderTarget)) {
            const gl = this._context,
                glFramebuffer = this._glFramebuffers.get(renderTarget);

            if (this._glFramebuffer === glFramebuffer) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                this._glFramebuffer = null;
            }

            gl.deleteFramebuffer(glFramebuffer);

            this._glFramebuffers.delete(renderTarget);
        }

        return this;
    }

    /**
     * @public
     * @param {Texture} texture
     * @returns {GLTexture}
     */
    getGLTexture(texture) {
        if (!this._glTextures.has(texture)) {
            this._glTextures.set(texture, new GLTexture(this._context));
        }

        return this._glTextures.get(texture);
    }

    /**
     * @public
     * @param {Texture} texture
     * @returns {RenderState}
     */
    removeTexture(texture) {
        if (this._glTextures.has(texture)) {
            const glTexture = this._glTextures.get(texture);

            if (this._glTexture === glTexture) {
                this._glTexture.unbind();
                this._glTexture = null;
            }

            glTexture.destroy();

            this._glTextures.delete(texture);
        }

        return this;
    }

    /**
     * @public
     * @param {Texture} texture
     * @param {Number} [unit}
     */
    bindTexture(texture, unit) {
        if (unit !== undefined) {
            this.textureUnit = unit;
        }

        this.glTexture = this.getGLTexture(texture);

        return this;
    }

    /**
     * @public
     * @param {Texture} texture
     * @param {Number} scaleMode
     */
    setScaleMode(texture, scaleMode) {
        return this.bindTexture(texture)
            .getGLTexture(texture)
            .setScaleMode(scaleMode);
    }

    /**
     * @public
     * @param {Texture} texture
     * @param {Number} wrapMode
     */
    setWrapMode(texture, wrapMode) {
        return this.bindTexture(texture)
            .getGLTexture(texture)
            .setWrapMode(wrapMode);
    }

    /**
     * @public
     * @param {Texture} texture
     * @param {Boolean} premultiplyAlpha
     */
    setPremultiplyAlpha(texture, premultiplyAlpha) {
        return this.bindTexture(texture)
            .getGLTexture(texture)
            .setPremultiplyAlpha(premultiplyAlpha);
    }

    /**
     * @public
     * @param {Texture} texture
     * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} source
     */
    setTextureImage(texture, source) {
        return this.bindTexture(texture)
            .getGLTexture(texture)
            .setTextureImage(source);
    }

    /**
     * @public
     * @param {RenderTarget} renderTarget
     * @returns {?WebGLFramebuffer}
     */
    getGLFramebuffer(renderTarget) {
        if (!this._glFramebuffers.has(renderTarget)) {
            this._glFramebuffers.set(renderTarget, renderTarget.isRoot ? null : this._context.createFramebuffer());
        }

        return this._glFramebuffers.get(renderTarget);
    }

    /**
     * @public
     * @returns {WebGLBuffer}
     */
    createBuffer() {
        return this._context.createBuffer();
    }

    /**
     * @public
     * @param {Number} size
     * @param {Number} attributeCount
     * @returns {ArrayBuffer}
     */
    createVertexBuffer(size, attributeCount) {
        return new ArrayBuffer(size * attributeCount * 4);
    }

    /**
     * @public
     * @param {Number} size
     * @returns {Uint16Array}
     */
    createIndexBuffer(size) {
        const buffer = new Uint16Array(size * 6),
            len = buffer.length;

        for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
            buffer[i] = offset;
            buffer[i + 1] = offset + 1;
            buffer[i + 2] = offset + 3;
            buffer[i + 3] = offset;
            buffer[i + 4] = offset + 2;
            buffer[i + 5] = offset + 3;
        }

        return buffer;
    }

    /**
     * @public
     * @chainable
     * @param {Color} [color]
     * @returns {RenderState}
     */
    bindVertexBuffer(buffer, data) {
        const gl = this._context;

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Color} [color]
     * @returns {RenderState}
     */
    bindIndexBuffer(buffer, data) {
        const gl = this._context;

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);

        return this;
    }

    /**
     * @public
     * @param {Float32Array} data
     * @param {Number} [offset=0]
     */
    setVertexSubData(data, offset = 0) {
        const gl = this._context;

        // todo - bind buffer

        gl.bufferSubData(gl.ARRAY_BUFFER, offset, data);
    }

    /**
     * @public
     * @param {WebGLBuffer} buffer
     */
    deleteBuffer(buffer) {
        this._context.deleteBuffer(buffer);
    }

    /**
     * @public
     * @param {WebGLBuffer} buffer
     */
    drawElements(count) {
        const gl = this._context;

        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    }

    /**
     * @public
     * @param {Number} type
     * @param {String} source
     * @returns {WebGLShader}
     */
    compileShader(type, source) {
        const gl = this._context,
            shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.log(gl.getShaderInfoLog(shader)); // eslint-disable-line

            return null;
        }

        return shader;
    }

    /**
     * @public
     * @param {String} vertexSource
     * @param {String} fragmentSource
     * @returns {?WebGLProgram}
     */
    compileProgram(vertexSource, fragmentSource) {
        const gl = this._context,
            vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource),
            fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource),
            program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);

            console.error('gl.VALIDATE_STATUS', gl.getProgramParameter(program, gl.VALIDATE_STATUS)); // eslint-disable-line
            console.error('gl.getError()', gl.getError()); // eslint-disable-line

            if (gl.getProgramInfoLog(program)) {
                console.warn('gl.getProgramInfoLog()', gl.getProgramInfoLog(program)); // eslint-disable-line
            }

            return null;
        }

        return program;
    }

    /**
     * @public
     * @chainable
     * @param {WebGLProgram} program
     * @returns {RenderState}
     */
    deleteProgram(program) {
        this._context.deleteProgram(program);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {WebGLProgram} program
     * @returns {RenderState}
     */
    useProgram(program) {
        this._context.useProgram(program);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {WebGLUniformLocation} location
     * @param {Number|Array|Texture} value
     * @param {Number} type
     * @param {Number} [unit]
     * @returns {RenderState}
     */
    setUniformValue(location, value, type, unit) {
        const gl = this._context;

        switch (type) {
            case UNIFORM_TYPE.INT:
                gl.uniform1i(location, value);

                return this;
            case UNIFORM_TYPE.FLOAT:
                gl.uniform1f(location, value);

                return this;
            case UNIFORM_TYPE.FLOAT_VEC2:
                gl.uniform2fv(location, value);

                return this;
            case UNIFORM_TYPE.FLOAT_VEC3:
                gl.uniform3fv(location, value);

                return this;
            case UNIFORM_TYPE.FLOAT_VEC4:
                gl.uniform4fv(location, value);

                return this;
            case UNIFORM_TYPE.INT_VEC2:
                gl.uniform2iv(location, value);

                return this;
            case UNIFORM_TYPE.INT_VEC3:
                gl.uniform3iv(location, value);

                return this;
            case UNIFORM_TYPE.INT_VEC4:
                gl.uniform4iv(location, value);

                return this;
            case UNIFORM_TYPE.BOOL:
                gl.uniform1i(location, value);

                return this;
            case UNIFORM_TYPE.BOOL_VEC2:
                gl.uniform2iv(location, value);

                return this;
            case UNIFORM_TYPE.BOOL_VEC3:
                gl.uniform3iv(location, value);

                return this;
            case UNIFORM_TYPE.BOOL_VEC4:
                gl.uniform4iv(location, value);

                return this;
            case UNIFORM_TYPE.FLOAT_MAT2:
                gl.uniformMatrix2fv(location, false, value);

                return this;
            case UNIFORM_TYPE.FLOAT_MAT3:
                gl.uniformMatrix3fv(location, false, value);

                return this;
            case UNIFORM_TYPE.FLOAT_MAT4:
                gl.uniformMatrix4fv(location, false, value);

                return this;
            case UNIFORM_TYPE.SAMPLER_2D:
                value.bind(this, unit)
                    .update();

                gl.uniform1i(location, unit);

                return this;
            default:
                throw new Error(`Unknown uniform type ${this._type}`);
        }

        return this;
    }

    getUniformLocation(program, name) {
        return this._context.getUniformLocation(program, name);
    }

    getAttributeLocation(program, name) {
        return this._context.getAttribLocation(program, name);
    }

    setVertexPointer(location, size, type, normalized, stride, offset) {
        this._context.vertexAttribPointer(location, size, type, normalized, stride, offset);
    }

    toggleVertexArray(location, enabled) {
        if (enabled) {
            this._context.enableVertexAttribArray(location);
        } else {
            this._context.disableVertexAttribArray(location);
        }
    }

    /**
     * @public
     */
    destroy() {
        this._clearColor.destroy();
        this._clearColor = null;

        this._viewport.destroy();
        this._viewport = null;

        this._projection.destroy();
        this._projection = null;

        this._context = null;

        this._glFramebuffer = null;
        this._glFramebuffers = null;

        this._textureUnit = null;
        this._glTexture = null;
        this._glTextures = null;

        this._blendMode = null;
        this._shader = null;
        this._renderer = null;
    }
}
