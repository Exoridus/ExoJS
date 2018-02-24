import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import ShaderBlock from './ShaderBlock';
import { UNIFORM_VALUES, UNIFORM_SIZES } from '../../const';

/**
 * @class ShaderProgram
 */
export default class ShaderProgram {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {String} vertexSource
     * @param {String} fragmentSource
     */
    constructor(gl, vertexSource, fragmentSource) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);

        /**
         * @private
         * @member {?WebGLShader}
         */
        this._fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        /**
         * @private
         * @member {?WebGLProgram}
         */
        this._program = this.createProgram(this._vertexShader, this._fragmentShader);
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
     * @returns {Map<String, ShaderAttribute>
     */
    extractAttributes() {
        const gl = this._context,
            program = this._program,
            length = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES),
            attributes = new Map();

        for (let i = 0; i < length; i++) {
            const { name, type, size } = gl.getActiveAttrib(program, i),
                lodation = gl.getAttribLocation(program, name);

            attributes.set(name, new ShaderAttribute(name, lodation, type, size));
        }

        return attributes;
    }

    /**
     * @public
     * @returns {Map<String, ShaderBlock>
     */
    extractUniformBlocks() {
        const gl = this._context,
            program = this._program,
            length = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS),
            uniformBlocks = new Map();

        for (let i = 0; i < length; i++) {
            const uniformBlock = new ShaderBlock(gl, program, i);

            uniformBlocks.set(uniformBlock.name, uniformBlock);
        }

        return uniformBlocks;
    }

    /**
     * @public
     * @returns {Map<String, ShaderUniform>
     */
    extractUniforms() {
        const gl = this._context,
            program = this._program,
            activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS),
            activeIndices = new Uint8Array(activeCount).map((value, index) => index),
            blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX),
            indices = activeIndices.filter((index) => (blocks[index] === -1)),
            length = indices.length,
            uniforms = new Map();

        for (let i = 0; i < length; i++) {
            const { type, size, name } = gl.getActiveUniform(program, indices[i]),
                value = new UNIFORM_VALUES[type](UNIFORM_SIZES[type] * size),
                uniform = new ShaderUniform(gl, program, indices[i], type, size, name, value);

            uniforms.set(uniform.uniformName, uniform);
        }

        return uniforms;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderProgram}
     */
    bind() {
        this._context.useProgram(this._program);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderProgram}
     */
    unbind() {
        this._context.useProgram(null);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteShader(this._vertexShader);
        this._context.deleteShader(this._fragmentShader);
        this._context.deleteProgram(this._program);

        this._context = null;
        this._program = null;
        this._vertexShader = null;
        this._fragmentShader = null;
    }
}
