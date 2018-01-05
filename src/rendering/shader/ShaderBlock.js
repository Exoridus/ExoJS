import ShaderUniform from './ShaderUniform';
import { TYPE_CLASSES, TYPE_SIZES } from '../../const/rendering';

/**
 * @class ShaderBlock
 */
export default class ShaderBlock {

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
         * @member {WebGLProgram}
         */
        this._program = program;

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
         * @member {Number}
         */
        this._dataSize = gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE);

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._blockData = new ArrayBuffer(this._dataSize);

        /**
         * @private
         * @member {WebGLBuffer}
         */
        this._uniformBuffer = gl.createBuffer();

        /**
         * @private
         * @member {Map<String, ShaderUniform>}
         */
        this._uniforms = this._extractUniforms();

        gl.bindBuffer(gl.UNIFORM_BUFFER, this._uniformBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, this._blockData, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._binding, this._uniformBuffer);
        gl.uniformBlockBinding(this._program, this._index, this._binding);
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
     * @member {Number}
     */
    get dataSize() {
        return this._dataSize;
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
     * @chainable
     * @returns {ShaderBlock}
     */
    upload() {
        const gl = this._context;

        gl.bindBuffer(gl.UNIFORM_BUFFER, this._uniformBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this._blockData);
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

        this._context = null;
        this._program = null;
        this._index = null;
        this._name = null;
        this._binding = null;
        this._dataSize = null;
        this._blockData = null;
        this._uniformBuffer = null;
    }

    /**
     * @private
     * @returns {Map<String, ShaderUniform>}
     */
    _extractUniforms() {
        const gl = this._context,
            program = this._program,
            blockData = this._blockData,
            uniformIndices = gl.getActiveUniformBlockParameter(program, this._index, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES),
            uniformOffsets = gl.getActiveUniforms(program, uniformIndices, gl.UNIFORM_OFFSET),
            uniformCount = uniformIndices.length,
            uniforms = new Map();

        for (let i = 0; i < uniformCount; i++) {
            const index = uniformIndices[i],
                { type, size, name } = gl.getActiveUniform(program, index),
                data = new TYPE_CLASSES[type](blockData, uniformOffsets[i], TYPE_SIZES[type] * size),
                uniform = new ShaderUniform(gl, program, index, type, size, name, data);

            uniforms.set(uniform.propName, uniform);
        }

        return uniforms;
    }
}
