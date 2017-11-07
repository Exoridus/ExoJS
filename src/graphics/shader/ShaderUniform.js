import Matrix from '../../math/Matrix';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} [options.value]
     * @param {Boolean} [options.transpose=false]
     */
    constructor({ name, type, value, transpose = false } = {}) {

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
         * @member {*}
         */
        this._value = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._transpose = transpose;

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
         * @member {Boolean}
         */
        this._dirty = false;

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
     * @member {Number|Number[]|Vector|Matrix|Texture}
     */
    get value() {
        return this._value;
    }

    set value(value) {
        this.setValue(value);
    }

    /**
     * @public
     * @param {*} value
     */
    setValue(value) {
        this._value = (value instanceof Matrix) ? value.toArray(this._transpose) : value;
        this._dirty = true;

        this.upload();
    }

    /**
     * @public
     * @param {GLProgram} glProgram
     */
    bind(glProgram) {
        if (!this._glProgram) {
            this._glProgram = glProgram;
        }

        if (!this._bound) {
            this._bound = true;

            this.upload();
        }
    }

    /**
     * @public
     */
    unbind() {
        if (this._bound) {
            this._bound = false;
        }
    }

    /**
     * @public
     */
    upload() {
        if (this._bound && this._dirty) {
            this._glProgram.setUniformValue(this._name, this._value, this._type);

            this._dirty = false;
        }
    }

    /**
     * @public
     */
    destroy() {
        this._name = null;
        this._type = null;
        this._value = null;
        this._transpose = null;
        this._glProgram = null;
        this._bound = null;
        this._dirty = null;
    }
}
