import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import { UNIFORM_TYPE } from '../../const';

/**
 * @class Shader
 */
export default class Shader {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {?String}
         */
        this._vertexSource = null;

        /**
         * @private
         * @member {?String}
         */
        this._fragmentSource = null;

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
         * @member {Map<String, WebGLUniformLocation>}
         */
        this._uniformLocations = new Map();

        /**
         * @private
         * @member {Map<String, Number>}
         */
        this._attributeLocations = new Map();

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
        }

        return this;
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
            throw new Error('Texture has to be connected first!')
        }

        const stride = [...this._attributes.values()].reduce((stride, attribute) => stride + attribute.byteSize, 0);
        let offset = 0;

        this._context.useProgram(this._program);

        for (const attribute of this._attributes.values()) {
            attribute.bind(this, stride, offset);

            offset += attribute.byteSize;
        }

        for (const uniform of this._uniforms.values()) {
            uniform.bind(this);
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

            for (const attribute of this._attributes.values()) {
                attribute.unbind();
            }

            for (const uniform of this._uniforms.values()) {
                uniform.unbind();
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String|String[]} source
     * @returns {Shader}
     */
    setVertexSource(source) {
        this._vertexSource = Array.isArray(source) ? source.join('\n') : source;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String|String[]} source
     * @returns {Shader}
     */
    setFragmentSource(source) {
        this._fragmentSource = Array.isArray(source) ? source.join('\n') : source;

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
    setAttribute(name, type, size, normalized = false, enabled = true) {
        if (this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" has already been defined.`);
        }

        this._attributes.set(name, new ShaderAttribute(name, type, size, normalized, enabled));

        return this;
    }

    /**
     * @public
     * @param {String} name
     * @returns {ShaderAttribute}
     */
    getAttribute(name) {
        if (!this._attributes.has(name)) {
            throw new Error(`Could not find Attribute "${name}".`);
        }

        return this._attributes.get(name);
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {Number} type
     * @param {Number} [value]
     * @returns {Shader}
     */
    setUniform(name, type, value) {
        if (this._uniforms.has(name)) {
            throw new Error(`Uniform "${name}" has already been defined.`);
        }

        this._uniforms.set(name, new ShaderUniform(name, type, value));

        return this;
    }

    /**
     * @public
     * @param {String} name
     * @returns {ShaderUniform}
     */
    getUniform(name) {
        if (!this._uniforms.has(name)) {
            throw new Error(`Could not find Uniform "${name}".`);
        }

        return this._uniforms.get(name);
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
     * @param {String} uniform
     * @returns {WebGLUniformLocation}
     */
    getUniformLocation(uniform) {
        if (!this._uniformLocations.has(uniform)) {
            const location = this._context.getUniformLocation(this._program, uniform);

            if (!location) {
                throw new Error(`Uniform "${this._name}" is not available.`);
            }

            this._uniformLocations.set(uniform, location);
        }

        return this._uniformLocations.get(uniform);
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
                throw new Error(`Attribute "${this._name}" is not available.`);
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
    setUniformValue(uniform, value, type) {
        const gl = this._context,
            location = this.getUniformLocation(uniform);

        switch (type) {
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
                throw new Error(`Unknown uniform type "${type}".`);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} attribute
     * @param {Number} size
     * @param {Number} type
     * @param {boolean} normalized
     * @param {Number} stride
     * @param {Number} offset
     * @returns {Shader}
     */
    setVertexPointer(attribute, size, type, normalized, stride, offset) {
        const gl = this._context,
            location = this.getAttributeLocation(attribute);

        gl.vertexAttribPointer(location, size, type, normalized, stride, offset);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} attribute
     * @param {Boolean} enabled
     * @returns {Shader}
     */
    toggleVertexArray(attribute, enabled) {
        const gl = this._context,
            location = this.getAttributeLocation(attribute);

        if (enabled) {
            gl.enableVertexAttribArray(location);
        } else {
            gl.disableVertexAttribArray(location);
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

        this._uniformLocations.clear();
        this._uniformLocations = null;

        this._attributeLocations.clear();
        this._attributeLocations = null;

        this._vertexSource = null;
        this._fragmentSource = null;
        this._context = null;
    }
}
