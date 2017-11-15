import { UNIFORM_TYPE } from '../../const';

/**
 * @class GLProgram
 */
export default class GLProgram {

    /**
     * @constructor
     * @param {WebGLRenderingContext} context
     * @param {String} vertexSource
     * @param {String} fragmentSource
     */
    constructor(context, vertexSource, fragmentSource) {
        if (!context) {
            throw new Error('No Rendering Context was provided.');
        }

        /**
         * @private
         * @member {WebGLRenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {WebGLShader}
         */
        this._vertexShader = this.createShader(context.VERTEX_SHADER, vertexSource);

        /**
         * @private
         * @member {WebGLShader}
         */
        this._fragmentShader = this.createShader(context.FRAGMENT_SHADER, fragmentSource);

        /**
         * @private
         * @member {WebGLProgram}
         */
        this._program = this.createProgram(this._vertexShader, this._fragmentShader);

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
     * @returns {GLProgram}
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
     * @returns {GLProgram}
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
     * @returns {GLProgram}
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
     * @chainable
     * @returns {GLProgram}
     */
    bind() {
        this._context.useProgram(this._program);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {GLProgram}
     */
    unbind() {
        this._context.useProgram(null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        const gl = this._context;

        gl.deleteShader(this._vertexShader);
        gl.deleteShader(this._fragmentShader);
        gl.deleteProgram(this._program);

        this._uniformLocations.clear();
        this._uniformLocations = null;

        this._attributeLocations.clear();
        this._attributeLocations = null;

        this._context = null;
        this._vertexShader = null;
        this._fragmentShader = null;
        this._program = null;
    }
}
