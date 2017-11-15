import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import GLProgram from '../webgl/GLProgram';

/**
 * @class Shader
 */
export default class Shader {

    /**
     * @constructor
     * @param {String|String[]} [vertexSource]
     * @param {String|String[]} [fragmentSource]
     */
    constructor(vertexSource, fragmentSource) {

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
         * @member {?DisplayManager}
         */
        this._displayManager = null;

        /**
         * @private
         * @member {?GLProgram}
         */
        this._program = null;

        /**
         * @private
         * @member {Number}
         */
        this._stride = 0;

        if (vertexSource !== undefined) {
            this.setVertexSource(vertexSource);
        }

        if (fragmentSource !== undefined) {
            this.setFragmentSource(fragmentSource);
        }
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get vertexSource() {
        return this._vertexSource;
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get fragmentSource() {
        return this._fragmentSource;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return this._displayManager && (this._displayManager.shader === this);
    }

    /**
     * @public
     * @param {String|String[]} source
     */
    setVertexSource(source) {
        this._vertexSource = Array.isArray(source) ? source.join('\n') : source;
    }

    /**
     * @public
     * @param {String|String[]} source
     */
    setFragmentSource(source) {
        this._fragmentSource = Array.isArray(source) ? source.join('\n') : source;
    }

    /**
     * @public
     * @param {Object[]} attributes
     * @param {String} attributes[].name
     * @param {Number} attributes[].type
     * @param {Number} attributes[].size
     * @param {Number} attributes[].offset
     * @param {Number} attributes[].stride
     * @param {Boolean} [attributes[].normalized=false]
     * @param {Boolean} [attributes[].enabled=true]
     */
    setAttributes(attributes) {
        for (const item of attributes) {
            const attribute = new ShaderAttribute(item);

            this._attributes.set(attribute.name, attribute);
            this._stride += attribute.byteSize;
        }
    }

    /**
     * @public
     * @param {Object[]} uniforms
     * @param {String} uniforms[].name
     * @param {Number} uniforms[].type
     * @param {Number} [uniforms[].unit=-1]
     * @param {Boolean} [uniforms[].transpose=false]
     */
    setUniforms(uniforms) {
        for (const item of uniforms) {
            const uniform = new ShaderUniform(item);

            this._uniforms.set(uniform.name, uniform);
        }
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
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Shader}
     */
    bind(displayManager) {
        if (!this._displayManager) {
            this._displayManager = displayManager;
            this._program = new GLProgram(displayManager.context, this._vertexSource, this._fragmentSource);
        }

        if (!this.bound) {
            this._program.bind();

            let offset = 0;

            for (const attribute of this._attributes.values()) {
                attribute.bind(this._program, this._stride, offset);

                offset += attribute.byteSize;
            }

            for (const uniform of this._uniforms.values()) {
                uniform.bind(this._program);
            }
        }

        return this;
    }

    /**
     * @public
     */
    unbind() {
        if (this.bound) {
            this._program.unbind();

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
     */
    destroy() {
        this.unbind();

        for (const attribute of this._attributes.values()) {
            attribute.destroy();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.destroy();
        }

        if (this._program) {
            this._program.destroy();
            this._program = null;
        }

        this._attributes.clear();
        this._attributes = null;

        this._uniforms.clear();
        this._uniforms = null;

        this._stride = null;
        this._vertexSource = null;
        this._fragmentSource = null;
        this._displayManager = null;
    }
}
