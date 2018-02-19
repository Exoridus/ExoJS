import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import ShaderBlock from './ShaderBlock';
import ShaderProgram from './ShaderProgram';

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
         * @member {?ShaderProgramm}
         */
        this._program = null;

        /**
         * @private
         * @member {Map<String, ShaderAttribute>}
         */
        this._attributes = null;

        /**
         * @private
         * @member {Map<String, ShaderUniform>}
         */
        this._uniforms = null;

        /**
         * @private
         * @member {Map<String, ShaderBlock>}
         */
        this._uniformBlocks = null;
    }

    /**
     * @public
     * @chainable
     * @param {WebGL2RenderingContext} gl
     * @returns {Shader}
     */
    connect(gl) {
        if (!this._program) {
            this._program = new ShaderProgram(gl, this._vertexSource, this._fragmentSource);
            this._attributes = this._program.extractAttributes();
            this._uniforms = this._program.extractUniforms();
            this._uniformBlocks = this._program.extractUniformBlocks();
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

        if (this._program) {
            for (const attribute of this._attributes.values()) {
                attribute.destroy();
            }

            for (const uniform of this._uniforms.values()) {
                uniform.destroy();
            }

            for (const uniformBlock of this._uniformBlocks.values()) {
                uniformBlock.destroy();
            }

            this._uniformBlocks.clear();
            this._uniformBlocks = null;

            this._uniforms.clear();
            this._uniforms = null;

            this._attributes.clear();
            this._attributes = null;

            this._program.destroy();
            this._program = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Shader}
     */
    bindProgram() {
        if (this._program) {
            this._program.bind();

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
        if (this._program) {
            this._program.unbind();
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

        this._uniformBlocks = null;
        this._uniforms = null;
        this._attributes = null;
        this._program = null;
        this._fragmentSource = null;
        this._vertexSource = null;
    }
}
