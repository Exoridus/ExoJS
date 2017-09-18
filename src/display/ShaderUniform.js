import { UNIFORM_TYPE } from '../const';
import Matrix from '../core/Matrix';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
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
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

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
     * @param {WebGLRenderingContext} gl
     * @param {WebGLProgram} program
     */
    setContext(gl, program) {
        if (this._context !== gl) {
            this._context = gl;
            this._location = gl.getUniformLocation(program, this._name);
        }
    }

    /**
     * @public
     * @param {*} value
     */
    setValue(value) {
        this._value = value;
        this._dirty = true;

        if (this._bound) {
            this._upload();
        }
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
    bind() {
        if (!this._bound) {
            this._bound = true;
            this._upload();
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
    destroy() {
        if (this._bound) {
            this.unbind();
        }

        this._name = null;
        this._type = null;
        this._value = null;
        this._context = null;
        this._location = null;
        this._bound = null;
        this._unit = null;
        this._transpose = null;
    }

    /**
     * @private
     */
    _upload() {
        if (!this._dirty) {
            return;
        }

        const gl = this._context,
            location = this._location,
            value = this._value;

        this._dirty = false;

        switch (this._type) {
            case UNIFORM_TYPE.INT:
                gl.uniform1i(location, value);

                return;
            case UNIFORM_TYPE.FLOAT:
                gl.uniform1f(location, value);

                return;
            case UNIFORM_TYPE.FLOAT_VEC2:
                gl.uniform2fv(location, value);

                return;
            case UNIFORM_TYPE.FLOAT_VEC3:
                gl.uniform3fv(location, value);

                return;
            case UNIFORM_TYPE.FLOAT_VEC4:
                gl.uniform4fv(location, value);

                return;
            case UNIFORM_TYPE.INT_VEC2:
                gl.uniform2iv(location, value);

                return;
            case UNIFORM_TYPE.INT_VEC3:
                gl.uniform3iv(location, value);

                return;
            case UNIFORM_TYPE.INT_VEC4:
                gl.uniform4iv(location, value);

                return;
            case UNIFORM_TYPE.BOOL:
                gl.uniform1i(location, value);

                return;
            case UNIFORM_TYPE.BOOL_VEC2:
                gl.uniform2iv(location, value);

                return;
            case UNIFORM_TYPE.BOOL_VEC3:
                gl.uniform3iv(location, value);

                return;
            case UNIFORM_TYPE.BOOL_VEC4:
                gl.uniform4iv(location, value);

                return;
            case UNIFORM_TYPE.FLOAT_MAT2:
                gl.uniformMatrix2fv(location, this._transpose, value);

                return;
            case UNIFORM_TYPE.FLOAT_MAT3:
                gl.uniformMatrix3fv(location, this._transpose, value);

                return;
            case UNIFORM_TYPE.FLOAT_MAT4:
                gl.uniformMatrix4fv(location, this._transpose, value);

                return;
            case UNIFORM_TYPE.SAMPLER_2D:
                value.glTexture
                    .setContext(this._context)
                    .bind(this._unit)
                    .update(this._unit);

                gl.uniform1i(location, this._unit);

                return;
            default:
                throw new Error(`Unknown uniform type ${this._type}`);
        }
    }
}
