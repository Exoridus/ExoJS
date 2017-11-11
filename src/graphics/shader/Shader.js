import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';

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
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?GLProgram}
         */
        this._glProgram = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

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
     * @chainable
     * @param {RenderState} renderState
     * @returns {Shader}
     */
    bind(renderState) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._glProgram = renderState.createGLProgram(this._vertexSource, this._fragmentSource);
        }

        if (!this._bound) {
            let offset = 0;

            this._renderState.glProgram = this._glProgram;

            for (const attribute of this._attributes.values()) {
                attribute.bind(this._glProgram, this._stride, offset);

                offset += attribute.byteSize;
            }

            for (const uniform of this._uniforms.values()) {
                uniform.bind(this._glProgram);
            }

            this._bound = true;
        }

        return this;
    }

    /**
     * @public
     */
    unbind() {
        if (this._bound) {
            this._renderState.glProgram = null;

            for (const attribute of this._attributes.values()) {
                attribute.unbind();
            }

            for (const uniform of this._uniforms.values()) {
                uniform.unbind();
            }

            this._bound = false;
        }

        return this;
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
            const attribute = (item instanceof ShaderAttribute) ? item : new ShaderAttribute(item);

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
            const uniform = (item instanceof ShaderUniform) ? item : new ShaderUniform(item);

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
     */
    destroy() {
        this.unbind();

        for (const attribute of this._attributes.values()) {
            attribute.destroy();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.destroy();
        }

        if (this._glProgram) {
            this._glProgram.destroy();
            this._glProgram = null;
        }

        this._attributes.clear();
        this._attributes = null;

        this._uniforms.clear();
        this._uniforms = null;

        this._vertexSource = null;
        this._fragmentSource = null;
        this._bound = null;
        this._stride = null;
        this._renderState = null;
    }
}
