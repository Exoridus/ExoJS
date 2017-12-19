import { UNIFORM_TYPE } from '../../const';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {Object} options
     * @param {WebGL2RenderingContext} options.context
     * @param {Number} options.index
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} options.size
     * @param {WebGLUniformLocation} options.location
     * @param {Number} options.block
     * @param {Number} options.offset
     * @param {Number|Number[]|ArrayBufferView} [options.value]
     */
    constructor({ context, index, name, type, size, location, block, offset, value = this._getDefaultValue(type, size) } = {}) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = context;

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

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
         * @member {WebGLUniformLocation}
         */
        this._location = location;

        /**
         * @private
         * @member {Number}
         */
        this._block = block;

        /**
         * @private
         * @member {Number}
         */
        this._offset = offset;

        /**
         * @private
         * @member {Number|Number[]|Boolean|Boolean[]|ArrayBufferView}
         */
        this._value = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get index() {
        return this._index;
    }

    set index(index) {
        this._index = index;
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
     * @member {Number}
     */
    get block() {
        return this._block;
    }

    set block(block) {
        this._block = block;
    }

    /**
     * @public
     * @member {Number}
     */
    get offset() {
        return this._offset;
    }

    set offset(offset) {
        this._offset = offset;
    }

    /**
     * @public
     * @member {Number|Number[]|Boolean|Boolean[]|ArrayBufferView}
     */
    get value() {
        return this._value;
    }

    set value(value) {
        this.setValue(value);
    }

    /**
     * @public
     * @chainable
     * @param {Number|Number[]|Boolean|Boolean[]|ArrayBufferView} value
     * @returns {ShaderUniform}
     */
    setValue(value) {
        if (value === undefined) {
            throw new Error(`Uniform value cannot be undefined!`);
        }

        const gl = this._context;

        this._value = value;

        switch (this._type) {
            case UNIFORM_TYPE.FLOAT: gl.uniform1f(this._location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC2: gl.uniform2fv(this._location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC3: gl.uniform3fv(this._location, value); break;
            case UNIFORM_TYPE.FLOAT_VEC4: gl.uniform4fv(this._location, value); break;

            case UNIFORM_TYPE.INT: gl.uniform1i(this._location, value); break;
            case UNIFORM_TYPE.INT_VEC2: gl.uniform2iv(this._location, value); break;
            case UNIFORM_TYPE.INT_VEC3: gl.uniform3iv(this._location, value); break;
            case UNIFORM_TYPE.INT_VEC4: gl.uniform4iv(this._location, value); break;

            case UNIFORM_TYPE.BOOL: gl.uniform1i(this._location, value); break;
            case UNIFORM_TYPE.BOOL_VEC2: gl.uniform2iv(this._location, value); break;
            case UNIFORM_TYPE.BOOL_VEC3: gl.uniform3iv(this._location, value); break;
            case UNIFORM_TYPE.BOOL_VEC4: gl.uniform4iv(this._location, value); break;

            case UNIFORM_TYPE.FLOAT_MAT2: gl.uniformMatrix2fv(this._location, false, value); break;
            case UNIFORM_TYPE.FLOAT_MAT3: gl.uniformMatrix3fv(this._location, false, value); break;
            case UNIFORM_TYPE.FLOAT_MAT4: gl.uniformMatrix4fv(this._location, false, value); break;

            case UNIFORM_TYPE.SAMPLER_2D: gl.uniform1i(this._location, value); break;

            default:
                throw new Error(`Unknown uniform type "${this._type}".`);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._index = null;
        this._name = null;
        this._type = null;
        this._size = null;
        this._location = null;
        this._block = null;
        this._offset = null;
        this._value = null;
        this._context = null;
    }

    /**
     * @private
     * @param {Number} type
     * @param {Number} size
     * @returns {Number|Number[]|Boolean|Boolean[]|ArrayBufferView}
     */
    _getDefaultValue(type, size) {
        switch (type) {
            case UNIFORM_TYPE.FLOAT: return 0;
            case UNIFORM_TYPE.FLOAT_VEC2: return new Float32Array(2 * size);
            case UNIFORM_TYPE.FLOAT_VEC3: return new Float32Array(3 * size);
            case UNIFORM_TYPE.FLOAT_VEC4: return new Float32Array(4 * size);

            case UNIFORM_TYPE.INT: return 0;
            case UNIFORM_TYPE.INT_VEC2: return new Int32Array(2 * size);
            case UNIFORM_TYPE.INT_VEC3: return new Int32Array(3 * size);
            case UNIFORM_TYPE.INT_VEC4: return new Int32Array(4 * size);

            case UNIFORM_TYPE.BOOL: return false;
            case UNIFORM_TYPE.BOOL_VEC2: return [ false, false ];
            case UNIFORM_TYPE.BOOL_VEC3: return [ false, false, false ];
            case UNIFORM_TYPE.BOOL_VEC4: return [ false, false, false, false ];

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

            case UNIFORM_TYPE.SAMPLER_2D: return 0;
        }
    }
}
