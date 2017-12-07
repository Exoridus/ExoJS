import { UNIFORM_TYPE } from '../../const';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {Object} options
     * @param {WebGLUniformLocation} options.location
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} options.size
     * @param {Number|Number[]|ArrayBufferView} [options.value]
     */
    constructor({ location, name, type, size, value = this._getDefaultValue(type, size) } = {}) {

        /**
         * @private
         * @member {WebGLUniformLocation}
         */
        this._location = location;

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
         * @member {Number}
         */
        this._size = size;

        /**
         * @private
         * @member {Number|Number[]|ArrayBufferView}
         */
        this._value = value;
    }

    /**
     * @public
     * @member {WebGLUniformLocation}
     */
    get location() {
        return this._location;
    }

    set location(location) {
        this._location = location;
    }

    /**
     * @public
     * @member {String}
     */
    get name() {
        return this._name;
    }

    set name(name) {
        this._name = name;
    }

    /**
     * @public
     * @member {Number}
     */
    get type() {
        return this._type;
    }

    set type(type) {
        this._type = type;
    }

    /**
     * @public
     * @member {Number}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this._size = size;
    }

    /**
     * @public
     * @member {Number|Number[]|ArrayBufferView}
     */
    get value() {
        return this._value;
    }

    set value(value) {
        this._value = value;
    }

    /**
     * @public
     */
    destroy() {
        this._name = null;
        this._type = null;
        this._size = null;
        this._location = null;
        this._value = null;
    }

    _getDefaultValue(type, size) {
        switch (type) {
            case UNIFORM_TYPE.FLOAT:
                return 0;
            case UNIFORM_TYPE.FLOAT_VEC2:
                return new Float32Array(2 * size);
            case UNIFORM_TYPE.FLOAT_VEC3:
                return new Float32Array(3 * size);
            case UNIFORM_TYPE.FLOAT_VEC4:
                return new Float32Array(4 * size);

            case UNIFORM_TYPE.INT:
                return 0;
            case UNIFORM_TYPE.INT_VEC2:
                return new Int32Array(2 * size);
            case UNIFORM_TYPE.INT_VEC3:
                return new Int32Array(3 * size);
            case UNIFORM_TYPE.INT_VEC4:
                return new Int32Array(4 * size);

            case UNIFORM_TYPE.BOOL:
                return false;
            case UNIFORM_TYPE.BOOL_VEC2:
                return this.booleanArray(2 * size);
            case UNIFORM_TYPE.BOOL_VEC3:
                return this.booleanArray(3 * size);
            case UNIFORM_TYPE.BOOL_VEC4:
                return this.booleanArray(4 * size);

            case UNIFORM_TYPE.FLOAT_MAT2:
                return new Float32Array([
                    1, 0,
                    0, 1
                ]);
            case UNIFORM_TYPE.FLOAT_MAT3:
                return new Float32Array([
                    1, 0, 0,
                    0, 1, 0,
                    0, 0, 1
                ]);
            case UNIFORM_TYPE.FLOAT_MAT4:
                return new Float32Array([
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1
                ]);
            case UNIFORM_TYPE.SAMPLER_2D:
                return 0;
        }
    }

    booleanArray(size) {
        var array = new Array(size);

        for (var i = 0; i < array.length; i++) {
            array[i] = false;
        }

        return array;
    }
}
