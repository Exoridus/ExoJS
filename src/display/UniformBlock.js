import Uniform from './Uniform';
import { UNIFORM_VALUE, UNIFORM_SIZES } from '../const';

/**
 * @class UniformBlock
 */
export default class UniformBlock {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLProgram} program
     * @param {Number} index
     */
    constructor(gl, program, index) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

        /**
         * @private
         * @member {String}
         */
        this._name = gl.getActiveUniformBlockName(program, index);

        /**
         * @private
         * @member {Number}
         */
        this._binding = gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_BINDING);

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._data = new ArrayBuffer(gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE));

        /**
         * @private
         * @member {Buffer}
         */
        this._buffer = Buffer.createUniformBuffer(gl, this._data);

        /**
         * @private
         * @member {Map<String, Uniform>}
         */
        this._uniforms = this.extractUniforms();

        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._binding, this._buffer.buffer);
        gl.uniformBlockBinding(program, this._index, this._binding);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get name() {
        return this._name;
    }

    /**
     * @public
     * @readonly
     * @member {ArrayBuffer}
     */
    get data() {
        return this._data;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get binding() {
        return this._binding;
    }

    /**
     * @public
     * @returns {Map<String, Uniform>}
     */
    extractUniforms() {
        const gl = this._context,
            program = this._program,
            indices = gl.getActiveUniformBlockParameter(program, this._index, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES),
            offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET),
            length = indices.length,
            uniforms = new Map();

        for (let i = 0; i < length; i++) {
            const { type, size, name } = gl.getActiveUniform(program, indices[i]),
                value = new UNIFORM_VALUE[type](this._data, offsets[i], UNIFORM_SIZES[type] * size),
                uniform = new Uniform(name, indices[i], type, size, value);

            uniforms.set(uniform.uniformName, uniform);
        }

        return uniforms;
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
     * @chainable
     * @returns {UniformBlock}
     */
    upload() {
        this._buffer.upload(this._data);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        for (const uniform of this._uniforms.values()) {
            uniform.destroy();
        }

        this._uniforms.clear();
        this._uniforms = null;

        this._buffer.destroy();
        this._buffer = null;

        this._context = null;
        this._index = null;
        this._name = null;
        this._data = null;
        this._binding = null;
    }
}
