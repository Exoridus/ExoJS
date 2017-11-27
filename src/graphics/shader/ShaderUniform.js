import Matrix from '../../math/Matrix';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} type
     * @param {Number|Number[]|ArrayBufferView} [value]
     */
    constructor(name, type, value) {

        /**
         * @private
         * @member {Shader}
         */
        this._shader = null;

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._type = type;

        /**
         * @private
         * @member {Number|Number[]|ArrayBufferView}
         */
        this._value = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._dirty = false;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;

        if (value !== undefined) {
            this.setValue(value);
        }
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
    get type() {
        return this._type;
    }

    /**
     * @public
     * @readonly
     * @member {Number|Number[]|ArrayBufferView}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @chainable
     * @param {Number|Number[]|ArrayBufferView} value
     * @returns {ShaderUniform}
     */
    setValue(value) {
        this._value = value;
        this._dirty = true;
        this.upload();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Shader} shader
     * @returns {ShaderUniform}
     */
    bind(shader) {
        if (!this._shader) {
            this._shader = shader;
        }

        if (!this._bound) {
            this._bound = true;
            this.upload();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderUniform}
     */
    unbind() {
        this._bound = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderUniform}
     */
    upload() {
        if (this._bound && this._dirty) {
            this._shader.setUniformValue(this._name, this._value, this._type);
            this._dirty = false;
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._shader = null;
        this._name = null;
        this._type = null;
        this._value = null;
        this._dirty = null;
        this._bound = null;
    }
}
