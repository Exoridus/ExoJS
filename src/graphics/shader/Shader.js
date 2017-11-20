import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import Program from './Program';

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
         * @member {?DisplayManager}
         */
        this._displayManager = null;

        /**
         * @private
         * @member {?Program}
         */
        this._program = null;

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
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return !!this._displayManager && (this._displayManager.shader === this);
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
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {Shader}
     */
    bind(displayManager) {
        if (!this._program) {
            this._program = new Program(displayManager.context, this._vertexSource, this._fragmentSource);
            this._displayManager = displayManager;
        }

        if (!this.bound) {
            const stride = [...this._attributes.values()].reduce((stride, attribute) => stride + attribute.byteSize, 0);
            let offset = 0;

            this._program.bind();

            for (const attribute of this._attributes.values()) {
                attribute.bind(this._program, stride, offset);

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

        this._vertexSource = null;
        this._fragmentSource = null;
        this._displayManager = null;
    }
}
