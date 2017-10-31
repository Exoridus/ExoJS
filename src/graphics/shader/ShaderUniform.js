import Matrix from '../../math/Matrix';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructs ShaderUniform
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} [options.unit=-1]
     * @param {Boolean} [options.transpose=false]
     */
    constructor({ name, type, unit = -1, transpose = false } = {}) {

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
         * @member {Number}
         */
        this._unit = unit;

        /**
         * @private
         * @member {Boolean}
         */
        this._transpose = transpose;

        /**
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?WebGLUniformLocation}
         */
        this._location = null;

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
        this._value = value;
        this._dirty = true;

        this.upload();
    }

    /**
     * @param {Matrix} matrix
     * @param {Boolean} [transpose=this._transpose]
     */
    setMatrix(matrix, transpose = this._transpose) {
        this._transpose = transpose;

        this.setValue((matrix instanceof Matrix) ? matrix.toArray(transpose) : matrix);
    }

    /**
     * @param {Texture} texture
     * @param {Number} unit
     */
    setTexture(texture, unit = this._unit) {
        this._unit = unit;

        this.setValue(texture);
    }

    /**
     * @public
     */
    bind(renderState, program) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._location = renderState.getUniformLocation(program, this._name);
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
            this._renderState.setUniformValue(this._location, this._value, this._type, this._unit);

            this._dirty = false;
        }
    }

    /**
     * @public
     */
    destroy() {
        if (this._bound) {
            this.unbind();
        }

        this._name = null;
        this._type = null;
        this._value = null;
        this._renderState = null;
        this._location = null;
        this._bound = null;
        this._unit = null;
        this._transpose = null;
        this._dirty = null;
    }
}
