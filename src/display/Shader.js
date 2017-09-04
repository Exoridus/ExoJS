import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import WebGLTexture from './WebGLTexture';
import Matrix from '../core/Matrix';
import {SCALE_MODE, UNIFORM_TYPE, WRAP_MODE} from '../const';
import {getScaleModeEnum, getWrapModeEnum} from '../utils';

/**
 * @class Shader
 * @memberof Exo
 */
export default class Shader {

    /**
     * @constructor
     * @param {?String} vertexSource
     * @param {?String} fragmentSource
     */
    constructor(vertexSource = null, fragmentSource = null) {

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLProgram}
         */
        this._program = null;

        /**
         * @private
         * @member {?String}
         */
        this._vertexSource = vertexSource;

        /**
         * @private
         * @member {?String}
         */
        this._fragmentSource = fragmentSource;

        /**
         * @private
         * @member {Map.<String, Exo.ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map.<String, Exo.ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Boolean}
         */
        this._inUse = false;

        /**
         * @private
         * @member {Number}
         */
        this._currentTextureUnit = -1;
    }

    /**
     * @public
     * @readonly
     * @member {?WebGLProgram}
     */
    get program() {
        return this._program;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get inUse() {
        return this._inUse;
    }

    set inUse(value) {
        this._inUse = !!value;
    }

    /**
     * @public
     * @member {String} value
     */
    get vertexSource() {
        return this._vertexSource;
    }

    set vertexSource(value) {
        this._vertexSource = Array.isArray(value) ? value.join('\n') : value;
    }

    /**
     * @public
     * @member {String} value
     */
    get fragmentSource() {
        return this._fragmentSource;
    }

    set fragmentSource(value) {
        this._fragmentSource = Array.isArray(value) ? value.join('\n') : value;
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (this._context) {
            return;
        }

        this._context = gl;
        this._program = this.compileProgram();
    }

    /**
     * @public
     * @returns {WebGLProgram}
     */
    compileProgram() {
        const gl = this._context,
            vertexShader = this.compileShader(this._vertexSource, gl.VERTEX_SHADER),
            fragmentShader = this.compileShader(this._fragmentSource, gl.FRAGMENT_SHADER),
            program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);

            throw new Error('Error: Could not initialize shader.', gl.getError());
        }

        return program;
    }

    /**
     * @public
     * @param {String|Array} source
     * @param {Number} shaderType
     * @returns {WebGLShader}
     */
    compileShader(source, shaderType) {
        if (!source) {
            throw new Error('Vertex or Fragment source need to be set first!');
        }

        const gl = this._context,
            shader = gl.createShader(shaderType);

        gl.shaderSource(shader, (source instanceof Array) ? source.join('\n') : source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error([
                'SHADER COMPILE ERROR:',
                '- LOG -',
                gl.getShaderInfoLog(shader),
                '- SOURCE -',
                source,
            ].join('\n\n'));
        }

        return shader;
    }

    /**
     * @public
     */
    bind() {
        this._context.useProgram(this._program);
        this._inUse = true;

        this.syncAttributes();
        this.syncUniforms();
    }

    /**
     * @public
     * @param {String} name
     * @param {Boolean} [active=true]
     */
    addAttribute(name, active = true) {
        if (this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" was already added.`);
        }

        this._attributes.set(name, new ShaderAttribute(name, active));
    }

    /**
     * @public
     * @param {String} name
     * @returns {Exo.ShaderAttribute}
     */
    getAttribute(name) {
        if (!this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" is missing.`);
        }

        return this._attributes.get(name);
    }

    /**
     * @public
     * @param {String} name
     */
    removeAttribute(name) {
        if (this._attributes.has(name)) {
            this._attributes.get(name).destroy();
            this._attributes.delete(name);
        }
    }

    /**
     * @public
     */
    syncAttributes() {
        const gl = this._context;

        for (const [name, attribute] of this._attributes) {
            if (attribute.location === null) {
                attribute.location = gl.getAttribLocation(this._program, name);
            }

            if (attribute.active) {
                gl.enableVertexAttribArray(attribute.location);
            } else {
                gl.disableVertexAttribArray(attribute.location);
            }
        }
    }

    /**
     * @public
     * @param {String} name
     * @param {Number} type
     */
    addUniform(name, type) {
        if (this._uniforms.has(name)) {
            throw new Error(`Uniform "${name}" was already added.`);
        }

        this._uniforms.set(name, new ShaderUniform(name, type));
    }

    /**
     * @public
     * @param {String} name
     * @returns {Exo.ShaderUniform}
     */
    getUniform(name) {
        if (!this._uniforms.has(name)) {
            throw new Error(`Uniform "${name}" is missing.`);
        }

        return this._uniforms.get(name);
    }

    /**
     * @public
     * @param {String} name
     * @param {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture} value
     * @param {Number} [textureUnit]
     */
    setUniformValue(name, value, textureUnit) {
        const uniform = this.getUniform(name);

        uniform.value = value;

        if (typeof textureUnit === 'number') {
            uniform.textureUnit = textureUnit;
        }

        if (this._inUse) {
            this._uploadUniform(uniform);
        }
    }

    /**
     * @public
     * @param {String} name
     */
    removeUniform(name) {
        if (this._uniforms.has(name)) {
            this._uniforms.get(name).destroy();
            this._uniforms.delete(name);
        }
    }

    /**
     * @public
     */
    syncUniforms() {
        for (const uniform of this._uniforms.values()) {
            this._uploadUniform(uniform);
        }
    }

    /**
     * @public
     * @param {String} name
     * @param {Number} number
     */
    setUniformNumber(name, number) {
        this.setUniformValue(name, number);
    }

    /**
     * @public
     * @param {String} name
     * @param {Exo.Vector|Number[]} vector
     */
    setUniformVector(name, vector) {
        this.setUniformValue(name, vector);
    }

    /**
     * @public
     * @param {String} name
     * @param {Exo.Color} color
     */
    setUniformColor(name, color) {
        this.setUniformValue(name, color.toArray(true));
    }

    /**
     * @public
     * @param {String} name
     * @param {Exo.Matrix|Array} matrix
     * @param {Boolean} [transpose=false]
     */
    setUniformMatrix(name, matrix, transpose = false) {
        this.setUniformValue(name, (matrix instanceof Matrix) ? matrix.toArray(transpose) : matrix);
    }

    /**
     * @public
     * @param {String} name
     * @param {Exo.Texture} texture
     * @param {Number} [textureUnit=0]
     */
    setUniformTexture(name, texture, textureUnit = 0) {
        this.setUniformValue(name, texture, textureUnit);
    }

    /**
     * @public
     * @param {Exo.Matrix} matrix
     */
    setProjection(matrix) {
        this.setUniformValue('projectionMatrix', matrix.toArray());
    }

    /**
     * @public
     * @param {HTMLImageElement|HTMLCanvasElement} source
     * @param {Number} [scaleMode=SCALE_MODE.NEAREST]
     * @param {Number} [wrapMode=WRAP_MODE.CLAMP_TO_EDGE]
     * @returns {WebGLTexture}
     */
    createWebGLTexture(source, scaleMode = SCALE_MODE.NEAREST, wrapMode = WRAP_MODE.CLAMP_TO_EDGE) {
        const gl = this._context,
            wrap = getWrapModeEnum(gl, wrapMode),
            scale = getScaleModeEnum(gl, scaleMode),
            texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, scale);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, scale);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

        gl.bindTexture(gl.TEXTURE_2D, null);

        return texture;
    }

    /**
     * @public
     */
    destroy() {
        for (const name of this._uniforms.keys()) {
            this.removeUniform(name);
        }
        this._uniforms.clear();
        this._uniforms = null;

        for (const name of this._attributes.keys()) {
            this.removeAttribute(name);
        }
        this._attributes.clear();
        this._attributes = null;

        if (this._program) {
            this._context.deleteProgram(this._program);
            this._program = null;
        }

        this._context = null;
        this._vertexSource = null;
        this._fragmentSource = null;
    }

    /**
     * Not the best looking method, but it does its job
     *
     * @private
     * @param {Object} value
     * @returns {Number}
     */
    _getLength(value) {
        let len = 0;

        if (value instanceof Array) {
            return value.length;
        }

        if (typeof value.x === 'number') {
            len++;

            if (typeof value.y === 'number') {
                len++;

                if (typeof value.z === 'number') {
                    len++;

                    if (typeof value.w === 'number') {
                        len++;
                    }
                }
            }
        }

        return len;
    }

    /**
     * @private
     * @param {Exo.ShaderUniform} uniform
     */
    _uploadUniform(uniform) {
        const gl = this._context,
            location = uniform.location || (uniform.location = gl.getUniformLocation(this._program, uniform.name)),
            value = uniform.value;

        let textureUnit;

        if (!uniform.dirty) {
            return;
        }

        switch (uniform.type) {
            case UNIFORM_TYPE.INT:
                gl.uniform1i(location, value);

                return;

            case UNIFORM_TYPE.FLOAT:
                gl.uniform1f(location, value);

                return;

            case UNIFORM_TYPE.VECTOR:
                if (value instanceof Array) {
                    switch (this._getLength(value)) {
                        case 1:
                            gl.uniform1fv(location, value);

                            return;
                        case 2:
                            gl.uniform2fv(location, value);

                            return;
                        case 3:
                            gl.uniform3fv(location, value);

                            return;
                        case 4:
                            gl.uniform4fv(location, value);

                            return;
                    }

                    return;
                }

                switch (this._getLength(value)) {
                    case 1:
                        gl.uniform1f(location, value);

                        return;
                    case 2:
                        gl.uniform2f(location, value.x, value.y);

                        return;
                    case 3:
                        gl.uniform3f(location, value.x, value.y, value.z);

                        return;
                    case 4:
                        gl.uniform4f(location, value.x, value.y, value.z, value.w);

                        return;
                }

                return;
            case UNIFORM_TYPE.VECTOR_INT:
                if (value instanceof Array) {
                    switch (this._getLength(value)) {
                        case 1:
                            gl.uniform1iv(location, value);

                            return;
                        case 2:
                            gl.uniform2iv(location, value);

                            return;
                        case 3:
                            gl.uniform3iv(location, value);

                            return;
                        case 4:
                            gl.uniform4iv(location, value);

                            return;
                    }

                    return;
                }

                switch (this._getLength(value)) {
                    case 1:
                        gl.uniform1i(location, value);

                        return;
                    case 2:
                        gl.uniform2i(location, value.x, value.y);

                        return;
                    case 3:
                        gl.uniform3i(location, value.x, value.y, value.z);

                        return;
                    case 4:
                        gl.uniform4i(location, value.x, value.y, value.z, value.w);

                        return;
                }

                return;

            case UNIFORM_TYPE.MATRIX:
                switch (value.length) {
                    case 4:
                        gl.uniformMatrix2fv(location, false, value);

                        return;
                    case 9:
                        gl.uniformMatrix3fv(location, false, value);

                        return;
                    case 16:
                        gl.uniformMatrix4fv(location, false, value);

                        return;
                }

                return;

            case UNIFORM_TYPE.TEXTURE:
                textureUnit = uniform.textureUnit;

                if (textureUnit !== this._currentTextureUnit) {
                    gl.activeTexture(gl[`TEXTURE${textureUnit}`]);
                    this._currentTextureUnit = textureUnit;
                }

                if (uniform.textureUnitChanged) {
                    gl.uniform1i(location, textureUnit);
                    uniform.textureUnitChanged = false;
                }

                if (!value.webGLTexture) {
                    value.webGLTexture = this.createWebGLTexture(value.source, value.scaleMode, value.wrapMode);
                }

                gl.bindTexture(gl.TEXTURE_2D, value.webGLTexture);

                return;

            case UNIFORM_TYPE:
                textureUnit = uniform.textureUnit;

                if (textureUnit !== this._currentTextureUnit) {
                    gl.activeTexture(gl.TEXTURE0 + textureUnit);
                    this._currentTextureUnit = textureUnit;
                }

                if (uniform.textureUnitChanged) {
                    gl.uniform1i(location, textureUnit);
                    uniform.textureUnitChanged = false;
                }

                if (!value.webGLTexture) {
                    value.webGLTexture = new WebGLTexture(gl);
                    value.webGLTexture.setSource(value.source);
                    value.webGLTexture.setScaleMode(value.scaleMode);
                    value.webGLTexture.setWrapMode(value.wrapMode);
                    value.webGLTexture.unbind();
                }

                value.webGLTexture.bind();

                return;

            default:
                throw new Error(`Wrong Uniform Type set! Uniform: ${uniform.name}`);
        }
    }
}
