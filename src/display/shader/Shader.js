import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import ShaderBlock from './ShaderBlock';
import { TYPE_CLASSES, TYPE_SIZES } from '../../const';

/**
 * @class Shader
 */
export default class Shader {

    /**
     * @constructor
     * @param {String} vertexSource
     * @param {String} fragmentSource
     */
    constructor(vertexSource, fragmentSource) {

        /**
         * @private
         * @member {String}
         */
        this._vertexSource = vertexSource;

        /**
         * @private
         * @member {String}
         */
        this._fragmentSource = fragmentSource;

        /**
         * @private
         * @member {?WebGL2RenderingContext}
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
         * @member {Map<String, ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Map<String, ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, ShaderBlock>}
         */
        this._uniformBlocks = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, ShaderAttribute>}
     */
    get attributes() {
        return this._attributes;
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, ShaderUniform>}
     */
    get uniforms() {
        return this._uniforms;
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, ShaderBlock>}
     */
    get uniformBlocks() {
        return this._uniformBlocks;
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
     * @param {WebGL2RenderingContext} gl
     * @returns {Shader}
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._vertexShader = this.createShader(gl.VERTEX_SHADER, this._vertexSource);
            this._fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this._fragmentSource);
            this._program = this.createProgram(this._vertexShader, this._fragmentShader);

            this._extractAttributes();
            this._extractUniforms();
            this._extractUniformBlocks();
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

        for (const uniform of this._uniforms.values()) {
            uniform.upload();
        }

        for (const uniformBlock of this._uniformBlocks.values()) {
            uniformBlock.upload();
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
     * @param {String} name
     * @returns {ShaderAttribute}
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
     * @returns {ShaderUniform}
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
     * @returns {ShaderBlock}
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

        this._vertexSource = null;
        this._fragmentSource = null;
        this._context = null;
    }

    /**
     * @private
     */
    _extractAttributes() {
        const gl = this._context,
            program = this._program,
            activeAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

        for (let i = 0; i < activeAttributes; i++) {
            const { name } = gl.getActiveAttrib(program, i);

            this._attributes.set(name, new ShaderAttribute(gl, program, i));
        }
    }

    /**
     * @private
     */
    _extractUniformBlocks() {
        const gl = this._context,
            program = this._program,
            activeBlocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);

        for (let index = 0; index < activeBlocks; index++) {
            const uniformBlock = new ShaderBlock(gl, program, index);

            this._uniformBlocks.set(uniformBlock.name, uniformBlock);
        }
    }

    /**
     * @private
     */
    _extractUniforms() {
        const gl = this._context,
            program = this._program,
            activeCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS),
            activeIndices = new Uint8Array(activeCount).map((value, index) => index),
            blocks = gl.getActiveUniforms(program, activeIndices, gl.UNIFORM_BLOCK_INDEX),
            indices = activeIndices.filter((index) => (blocks[index] === -1)),
            len = indices.length;

        for (let i = 0; i < len; i++) {
            const index = indices[i],
                { type, size, name } = gl.getActiveUniform(program, index),
                uniform = new ShaderUniform(gl, program, index, type, size, name, new TYPE_CLASSES[type](TYPE_SIZES[type] * size));

            this._uniforms.set(uniform.name, uniform);
        }
    }
}
