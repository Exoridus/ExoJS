import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';

var GLSL_TO_SIZE = {
    [UNIFORM_TYPE.FLOAT]: 1,
    [UNIFORM_TYPE.FLOAT_VEC2]: 2,
    [UNIFORM_TYPE.FLOAT_VEC3]: 3,
    [UNIFORM_TYPE.FLOAT_VEC4]: 4,
    [UNIFORM_TYPE.INT]: 1,
    [UNIFORM_TYPE.INT_VEC2]: 2,
    [UNIFORM_TYPE.INT_VEC3]: 3,
    [UNIFORM_TYPE.INT_VEC4]: 4,
    [UNIFORM_TYPE.BOOL]: 1,
    [UNIFORM_TYPE.BOOL_VEC2]: 2,
    [UNIFORM_TYPE.BOOL_VEC3]: 3,
    [UNIFORM_TYPE.BOOL_VEC4]: 4,
    [UNIFORM_TYPE.FLOAT_MAT2]: 4,
    [UNIFORM_TYPE.FLOAT_MAT3]: 9,
    [UNIFORM_TYPE.FLOAT_MAT4]: 16,
    [UNIFORM_TYPE.SAMPLER_2D]: 1,
};

/**
 * @class Shader
 */
export default class Shader {

    /**
     * @constructor
     */
    constructor(vertexSource, fragmentSource, options = {}) {

        /**
         * @private
         * @member {String}
         */
        this._vertexSource = Array.isArray(vertexSource) ? vertexSource.join('\n') : vertexSource;

        /**
         * @private
         * @member {String}
         */
        this._fragmentSource = Array.isArray(fragmentSource) ? fragmentSource.join('\n') : fragmentSource;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._vertexShader = null;

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._fragmentShader = null;

        /**
         * @private
         * @member {?WebGLProgram}
         */
        this._program = null;

        /**
         * @private
         * @member {Object}
         */
        this._options = options || {};

        /**
         * @private
         * @member {Map<String, ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Map<String, Number>}
         */
        this._attributeLocations = new Map();
    }

    /**
     * @public
     * @param {Number} type
     * @param {String} source
     * @returns {WebGLShader}
     */
    createShader(type, source) {
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
     * @param {WebGLShader} vertexShader
     * @param {WebGLShader} fragmentShader
     * @returns {?WebGLProgram}
     */
    createProgram(vertexShader, fragmentShader) {
        const gl = this._context,
            program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.detachShader(program, vertexShader);
            gl.detachShader(program, fragmentShader);

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
     * @param {WebGLRenderingContext} gl
     * @returns {Shader}
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._vertexShader = this.createShader(gl.VERTEX_SHADER, this._vertexSource);
            this._fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this._fragmentSource);
            this._program = this.createProgram(this._vertexShader, this._fragmentShader);
            this.extractUniforms();
        }

        return this;
    }

    /**
     * @public
     */
    extractUniforms() {
        const gl = this._context,
            program = this._program,
            len = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS),
            opts = this._options['uniforms'] || {};

        for (var i = 0; i < len; i++) {
            const uniform = gl.getActiveUniform(program, i),
                name = uniform.name.replace(/\[.*?\]/, ''),
                options = Object.assign({}, {
                    name: name,
                    type: uniform.type,
                    size: GLSL_TO_SIZE[uniform.type],
                    location: gl.getUniformLocation(program, name),
                }, (opts[name] || {}));

            this._uniforms.set(name, new ShaderUniform(options));
        }
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    disconnect() {
        this.unbindProgram();

        if (this._context) {
            const gl = this._context;

            gl.deleteShader(this._vertexShader);
            gl.deleteShader(this._fragmentShader);
            gl.deleteProgram(this._program);

            this._vertexShader = null;
            this._fragmentShader = null;
            this._program = null;
            this._context = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    bindProgram() {
        if (!this._context) {
            throw new Error('No context!')
        }

        const gl = this._context;

        gl.useProgram(this._program);

        this.bindAttributes();

        for (const uniform of this._uniforms.values()) {
            this.setUniform(uniform.name, uniform.value);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    bindAttributes() {
        const gl = this._context,
            stride = [...this._attributes.values()].reduce((stride, attribute) => stride + attribute.byteSize, 0);

        let offset = 0;

        for (const attribute of this._attributes.values()) {
            const location = this.getAttributeLocation(attribute.name);

            gl.vertexAttribPointer(location, attribute.size, attribute.type, attribute.normalized, stride, offset);

            if (attribute.enabled) {
                gl.enableVertexAttribArray(location);
            } else {
                gl.disableVertexAttribArray(location);
            }

            offset += attribute.byteSize;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    unbindProgram() {
        if (this._context) {
            this._context.useProgram(null);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {Number} type
     * @param {Number} size
     * @param {Boolean} [normalized=false]
     * @param {Boolean} [enabled=true]
     * @returns {Shader}
     */
    addAttribute(name, type, size, normalized = false, enabled = true) {
        if (this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" has already been defined.`);
        }

        this._attributes.set(name, new ShaderAttribute(name, type, size, normalized, enabled));

        return this;
    }

    /**
     * @public
     * @param {String} attribute
     * @returns {Number}
     */
    getAttributeLocation(attribute) {
        if (!this._attributeLocations.has(attribute)) {
            const location = this._context.getAttribLocation(this._program, attribute);

            if (location === -1) {
                throw new Error(`Attribute "${attribute}" is not available.`);
            }

            this._attributeLocations.set(attribute, location);
        }

        return this._attributeLocations.get(attribute);
    }

    /**
     * @public
     * @chainable
     * @param {String} uniform
     * @param {Number|Number[]|ArrayBufferView|Texture} value
     * @param {Number} type
     * @returns {Shader}
     */
    setUniform(name, value) {
        if (!this._uniforms.has(name)) {
            throw new Error(`Uniform "${name}" is not available.`);
        }

        if (value === undefined) {
            throw new Error(`Invalid uniform value!`);
        }

        const gl = this._context,
            uniform = this._uniforms.get(name) || null,
            location = uniform.location;

        uniform.value = value;

        switch (uniform.type) {
            case UNIFORM_TYPE.INT: gl.uniform1i(location, value); break;
            case UNIFORM_TYPE.FLOAT: gl.uniform1f(location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC2: gl.uniform2fv(location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC3: gl.uniform3fv(location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC4: gl.uniform4fv(location, value); break;
            case UNIFORM_TYPE.INT_VEC2: gl.uniform2iv(location, value); break;
            case UNIFORM_TYPE.INT_VEC3: gl.uniform3iv(location, value); break;
            case UNIFORM_TYPE.INT_VEC4: gl.uniform4iv(location, value); break;
            case UNIFORM_TYPE.BOOL: gl.uniform1i(location, value); break;
            case UNIFORM_TYPE.BOOL_VEC2: gl.uniform2iv(location, value); break;
            case UNIFORM_TYPE.BOOL_VEC3: gl.uniform3iv(location, value); break;
            case UNIFORM_TYPE.BOOL_VEC4: gl.uniform4iv(location, value); break;
            case UNIFORM_TYPE.FLOAT_MAT2: gl.uniformMatrix2fv(location, false, value); break;
            case UNIFORM_TYPE.FLOAT_MAT3: gl.uniformMatrix3fv(location, false, value); break;
            case UNIFORM_TYPE.FLOAT_MAT4: gl.uniformMatrix4fv(location, false, value); break;
            case UNIFORM_TYPE.SAMPLER_2D: gl.uniform1i(location, value); break;
            default:
                throw new Error(`Unknown uniform type "${uniform.type}".`);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        for (const attribute of this._attributes.values()) {
            attribute.destroy();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.destroy();
        }

        this._attributes.clear();
        this._attributes = null;

        this._uniforms.clear();
        this._uniforms = null;

        this._attributeLocations.clear();
        this._attributeLocations = null;

        this._vertexSource = null;
        this._fragmentSource = null;
        this._context = null;
    }
}
