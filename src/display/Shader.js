import ShaderAttribute from './ShaderAttribute';
import ShaderUniform from './ShaderUniform';
import Matrix from '../core/Matrix';
import {compileProgram} from '../utils';

/**
 * @class Shader
 * @memberof Exo
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
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLProgram}
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
         * @member {Map<String, Exo.ShaderUniform>}
         */
        this._uniforms = new Map();

        /**
         * @private
         * @member {Map<String, Exo.ShaderAttribute>}
         */
        this._attributes = new Map();

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        if (vertexSource !== undefined) {
            this.setVertexSource(vertexSource);
        }

        if (fragmentSource !== undefined) {
            this.setFragmentSource(fragmentSource);
        }
    }

    /**
     * @public
     * @member {String|String[]}
     */
    get vertexSource() {
        return this._vertexSource;
    }

    set vertexSource(value) {
        this.setVertexSource(value);
    }

    /**
     * @public
     * @member {String|String[]}
     */
    get fragmentSource() {
        return this._fragmentSource;
    }

    set fragmentSource(value) {
        this.setFragmentSource(value);
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     */
    setContext(gl) {
        if (this._context) {
            return;
        }

        this._context = gl;
        this._program = compileProgram(gl, this._vertexSource, this._fragmentSource);

        for (const attribute of this._attributes.values()) {
            attribute.setContext(gl, this._program);
        }

        for (const uniform of this._uniforms.values()) {
            uniform.setContext(gl, this._program);
        }
    }

    /**
     * @public
     */
    bind() {
        if (this._bound) {
            return;
        }

        this._bound = true;

        this._context.useProgram(this._program);

        for (const attribute of this._attributes.values()) {
            attribute.bind();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.bind();
        }

        this.bindAttributePointers();
    }

    /**
     * @public
     */
    unbind() {
        if (!this._bound) {
            return;
        }

        this._bound = false;

        for (const attribute of this._attributes.values()) {
            attribute.unbind();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.unbind();
        }
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
     * @param {Object<String, Boolean>} attributes
     */
    setAttributes(attributes) {
        for (const name of Object.keys(attributes)) {
            if (this._attributes.has(name)) {
                throw new Error(`Attribute "${name}" was already added.`);
            }

            this._attributes.set(name, new ShaderAttribute(name, attributes[name]));
        }
    }

    /**
     * @public
     * @param {String} name
     * @returns {Exo.ShaderAttribute}
     */
    getAttribute(name) {
        if (!this._attributes.has(name)) {
            throw new Error(`Attribute "${name}" is missing.`);
        }

        return this._attributes.get(name);
    }

    /**
     * @public
     * @param {Object<String, Number>} uniforms
     */
    setUniforms(uniforms) {
        for (const name of Object.keys(uniforms)) {
            if (this._uniforms.has(name)) {
                throw new Error(`Uniform "${name}" was already added.`);
            }

            this._uniforms.set(name, new ShaderUniform(name, uniforms[name]));
        }
    }

    /**
     * @public
     * @param {String} name
     * @returns {Exo.ShaderUniform}
     */
    getUniform(name) {
        if (!this._uniforms.has(name)) {
            throw new Error(`Could not find Uniform "${name}".`);
        }

        return this._uniforms.get(name);
    }

    /**
     * @public
     * @param {Exo.Matrix} projection
     */
    setProjection(projection) {
        // do nothing...
    }

    /**
     * @public
     */
    bindAttributePointers() {
        // do nothing...
    }

    /**
     * @public
     */
    destroy() {
        if (this._bound) {
            this.unbind();
        }

        for (const attribute of this._attributes.values()) {
            attribute.destroy();
        }

        for (const uniform of this._uniforms.values()) {
            uniform.destroy();
        }

        if (this._context) {
            this._context.deleteProgram(this._program);
            this._program = null;
            this._context = null;
        }

        this._uniforms.clear();
        this._uniforms = null;

        this._attributes.clear();
        this._attributes = null;

        this._vertexSource = null;
        this._fragmentSource = null;
        this._bound = null;
    }
}
