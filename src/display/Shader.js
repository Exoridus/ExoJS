import Attribute from './Attribute';
import Uniform from './Uniform';
import UniformBlock from './UniformBlock';
import { UNIFORM_SIZES, UNIFORM_VALUES } from '../const';

/**
 * @class Shader
 */
export default class Shader {

    /**
     * @constructor
     * @param {String} vertSource
     * @param {String} fragSource
     */
    constructor(vertSource, fragSource) {

        /**
         * @private
         * @member {String}
         */
        this._vertSource = vertSource;

        /**
         * @private
         * @member {String}
         */
        this._fragSource = fragSource;

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._vertShader = null;

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._fragShader = null;

        /**
         * @private
         * @member {?WebGLProgram}
         */
        this._program = null;

        /**
         * @private
         * @member {Map<String, Attribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Map<String, Uniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, UniformBlock>}
         */
        this._uniformBlocks = new Map();
    }

    /**
     * @public
     * @chainable
     * @param {WebGL2RenderingContext} gl
     * @returns {Shader}
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._vertShader = this.createShader(gl.VERTEX_SHADER, this._vertSource);
            this._fragShader = this.createShader(gl.FRAGMENT_SHADER, this._fragSource);
            this._program = this.createProgram(this._vertShader, this._fragShader);

            this.extractAttributes();
            this.extractUniforms();
            this.extractUniformBlocks();
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
            this._context.deleteShader(this._vertShader);
            this._context.deleteShader(this._fragShader);
            this._context.deleteProgram(this._program);

            for (const attribute of this._attributes.values()) {
                attribute.destroy();
            }

            for (const uniform of this._uniforms.values()) {
                uniform.destroy();
            }

            for (const uniformBlock of this._uniformBlocks.values()) {
                uniformBlock.destroy();
            }

            this._attributes.clear();
            this._attributes = null;

            this._uniforms.clear();
            this._uniforms = null;

            this._uniformBlocks.clear();
            this._uniformBlocks = null;

            this._vertShader = null;
            this._fragShader = null;
            this._program = null;
            this._context = null;
        }

        return this;
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
     * @returns {Shader}
     */
    bindProgram() {
        if (this._context) {
            this._context.useProgram(this._program);

            for (const uniform of this._uniforms.values()) {
                uniform.upload();
            }

            for (const uniformBlock of this._uniformBlocks.values()) {
                uniformBlock.upload();
            }
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
     * @returns {Shader}
     */
    extractAttributes() {
        const gl = this._context,
            len = gl.getProgramParameter(this._program, gl.ACTIVE_ATTRIBUTES);

        for (let i = 0; i < len; i++) {
            const { name, type, size } = gl.getActiveAttrib(this._program, i),
                lodation = gl.getAttribLocation(this._program, name);

            this._attributes.set(name, new Attribute(name, lodation, type, size));
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    extractUniformBlocks() {
        const gl = this._context,
            length = gl.getProgramParameter(this._program, gl.ACTIVE_UNIFORM_BLOCKS);

        for (let i = 0; i < length; i++) {
            const uniformBlock = new UniformBlock(gl, this._program, i);

            this._uniformBlocks.set(uniformBlock.name, uniformBlock);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    extractUniforms() {
        const gl = this._context,
            program = this._program,
            activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS),
            activeIndices = new Uint8Array(activeCount).map((value, index) => index),
            blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX),
            indices = activeIndices.filter((index) => (blocks[index] === -1)),
            length = indices.length;

        for (let i = 0; i < length; i++) {
            const { type, size, name } = gl.getActiveUniform(program, indices[i]),
                value = new UNIFORM_VALUES[type](UNIFORM_SIZES[type] * size),
                uniform = new Uniform(gl, program, indices[i], type, size, name, value);

            this._uniforms.set(uniform.uniformName, uniform);
        }

        return this;
    }

    /**
     * @public
     * @param {String} name
     * @returns {Attribute}
     */
    getAttribute(name) {
        if (!this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" is not available.`);
        }

        return this._attributes.get(name);
    }

    /**
     * @public
     * @param {String} name
     * @returns {Uniform}
     */
    getUniform(name) {
        if (!this._uniforms.has(name)) {
            throw new Error(`Uniform "${name}" is not available.`);
        }

        return this._uniforms.get(name);
    }

    /**
     * @public
     * @param {String} name
     * @returns {UniformBlock}
     */
    getUniformBlock(name) {
        if (!this._uniformBlocks.has(name)) {
            throw new Error(`Uniform Block "${name}" is not available.`);
        }

        return this._uniformBlocks.get(name);
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._vertSource = null;
        this._fragSource = null;
        this._vertShader = null;
        this._fragShader = null;
        this._program = null;
        this._attributes = null;
        this._uniforms = null;
        this._uniformBlocks = null;
    }
}
