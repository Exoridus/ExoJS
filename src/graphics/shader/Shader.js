import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import { TYPE_SIZES, UNIFORM_TYPE } from '../../const';
import ShaderBlock from './ShaderBlock';

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
         * @member {Object<String, ShaderAttribute>}
         */
        this._attributes = {};

        /**
         * @private
         * @member {Object<String, ShaderUniform>}
         */
        this._uniforms = {};

        /**
         * @private
         * @member {Object<String, ShaderBlock>}
         */
        this._blocks = {};
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, ShaderAttribute>}
     */
    get attributes() {
        return this._attributes;
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, ShaderUniform>}
     */
    get uniforms() {
        return this._uniforms;
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, ShaderBlock>}
     */
    get blocks() {
        return this._blocks;
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

            for (const name of Object.keys(this._attributes)) {
                this._attributes[name].destroy();
                delete this._attributes[name];
            }

            for (const name of Object.keys(this._uniforms)) {
                this._uniforms[name].destroy();
                delete this._uniforms[name];
            }

            for (const name of Object.keys(this._blocks)) {
                this._blocks[name].destroy();
                delete this._blocks[name];
            }

            this._attributes = null;
            this._uniforms = null;
            this._blocks = null;
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

        for (const uniform of Object.values(this._uniforms)) {
            uniform.setValue(uniform.value);
        }

        for (const block of Object.values(this._blocks)) {
            block.setValue(block.value);
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
     * @returns {ShaderUniform}
     */
    getUniform(name) {
        if (!(name in this._uniforms)) {
            throw new Error(`Uniform "${name}" is not available.`);
        }

        return this._uniforms[name];
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
            totalAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

        for (let i = 0; i < totalAttributes; i++) {
            const { name, type } = gl.getActiveAttrib(program, i);

            this._attributes[name] = new ShaderAttribute(Object.assign({}, {
                name: name,
                type: type,
                size: TYPE_SIZES[type],
                location: gl.getAttribLocation(program, name),
            }));
        }
    }

    /**
     * @private
     */
    _extractUniforms() {
        const gl = this._context,
            program = this._program,
            activeUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS),
            indices = new Uint8Array(activeUniforms).map((value, index) => index),
            blockIndices = gl.getActiveUniforms(program, indices, gl.UNIFORM_BLOCK_INDEX),
            offsets = gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET),
            blocks = {};

        for (const index of indices) {
            const { name, type, size } = gl.getActiveUniform(program, index),
                location = gl.getUniformLocation(program, name),
                block = blockIndices[index],
                offset = offsets[index],
                uniform = new ShaderUniform({ context: gl, index, name, type, size, location, block, offset });

            if (block !== -1) {
                if (!(block in blocks)) {
                    blocks[block] = new ShaderBlock({
                        context: gl,
                        index: block,
                        name: gl.getActiveUniformBlockName(program, block),
                        size: gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_DATA_SIZE),
                        usedByVertexShader: gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER),
                        usedByFragmentShader: gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER),
                    });
                }

                blocks[block].addUniform(uniform);

                continue;
            }

            this._uniforms[name] = uniform;
        }

        for (const block of Object.values(blocks)) {
            const transformBuffer = gl.createBuffer();

            this._blocks[block.name] = block;

            gl.bindBuffer(gl.UNIFORM_BUFFER, transformBuffer);
            gl.bufferData(gl.UNIFORM_BUFFER, new ArrayBuffer(block.size), gl.STATIC_DRAW);
            gl.bindBufferBase(gl.UNIFORM_BUFFER, block.index, transformBuffer);
        }
    }
}
