import {UNIFORM_TYPE} from '../const';
import GLTexture from './GLTexture';
import Matrix from '../core/Matrix';

/**
 * @class ShaderUniform
 * @memberof Exo
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} type
     * @param {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture} [value]
     */
    constructor(name, type, value) {

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
         * @member {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture}
         */
        this._value = value;

        /**
         * @private
         * @member {Number}
         */
        this._textureUnit = -1;

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
     * @member {?WebGLUniformLocation}
     */
    get location() {
        return this._location;
    }

    /**
     * @public
     * @member {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture}
     */
    get value() {
        return this._value;
    }

    set value(value) {
        this.setValue(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get textureUnit() {
        return this._textureUnit;
    }

    set textureUnit(value) {
        this.setTextureUnit(value);
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     * @param {WebGLProgram} program
     */
    setContext(gl, program) {
        if (!this._context) {
            this._context = gl;
            this._location = gl.getUniformLocation(program, this._name);
        }
    }

    /**
     * @public
     * @param {Number|Number[]|Exo.Vector|Exo.Matrix|Exo.Texture} value
     */
    setValue(value) {
        this._value = value;
        this._dirty = true;
        this._upload();
    }

    /**
     * @public
     * @param {Number} unit
     */
    setTextureUnit(unit) {
        this._textureUnit = unit;
        this._dirty = true;
        this._upload();
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
        this._bound = false;
    }

    /**
     * @public
     */
    destroy() {
        this._name = null;
        this._type = null;
        this._value = null;
        this._textureUnit = null;
        this._context = null;
        this._location = null;
        this._bound = null;
        this._dirty = null;
    }

    /**
     * @private
     */
    _upload() {
        if (!this._bound || !this._dirty || this._value === undefined) {
            return;
        }

        switch (this._type) {
            case UNIFORM_TYPE.INT:
                this._uploadInt();
                break;
            case UNIFORM_TYPE.FLOAT:
                this._uploadFloat();
                break;
            case UNIFORM_TYPE.VECTOR:
                this._uploadVector();
                break;
            case UNIFORM_TYPE.VECTOR_INT:
                this._uploadIntVector();
                break;
            case UNIFORM_TYPE.MATRIX:
                this._uploadMatrix();
                break;
            case UNIFORM_TYPE.TEXTURE:
                this._uploadTexture();
                break;
            default:
                throw new Error(`Invalid uniform type ${this._type}`);
        }

        this._dirty = false;
    }

    /**
     * @private
     */
    _uploadInt() {
        return this._context.uniform1i(this._location, this._value);
    }

    /**
     * @private
     */
    _uploadFloat() {
        return this._context.uniform1f(this._location, this._value);
    }

    /**
     * @private
     */
    _uploadVector() {
        const gl = this._context,
            location = this._location,
            vector = this._value;

        if (vector instanceof Array) {
            switch (this._getLength(vector)) {
                case 1:
                    return gl.uniform1fv(location, vector);
                case 2:
                    return gl.uniform2fv(location, vector);
                case 3:
                    return gl.uniform3fv(location, vector);
                case 4:
                    return gl.uniform4fv(location, vector);
            }
        } else {
            switch (this._getLength(vector)) {
                case 1:
                    return gl.uniform1f(location, vector.x);
                case 2:
                    return gl.uniform2f(location, vector.x, vector.y);
                case 3:
                    return gl.uniform3f(location, vector.x, vector.y, vector.z);
                case 4:
                    return gl.uniform4f(location, vector.x, vector.y, vector.z, vector.w);
            }
        }
    }

    /**
     * @private
     */
    _uploadIntVector() {
        const gl = this._context,
            location = this._location,
            vector = this._value;

        if (Array.isArray(vector)) {
            switch (this._getLength(vector)) {
                case 1:
                    return gl.uniform1iv(location, vector);
                case 2:
                    return gl.uniform2iv(location, vector);
                case 3:
                    return gl.uniform3iv(location, vector);
                case 4:
                    return gl.uniform4iv(location, vector);
            }
        } else {
            switch (this._getLength(vector)) {
                case 1:
                    return gl.uniform1i(location, vector.x);
                case 2:
                    return gl.uniform2i(location, vector.x, vector.y);
                case 3:
                    return gl.uniform3i(location, vector.x, vector.y, vector.z);
                case 4:
                    return gl.uniform4i(location, vector.x, vector.y, vector.z, vector.w);
            }
        }
    }

    /**
     * @private
     */
    _uploadMatrix() {
        const gl = this._context,
            location = this._location,
            matrix = (this._value instanceof Matrix) ? this._value.toArray() : this._value;

        switch (matrix.length) {
            case 4:
                return gl.uniformMatrix2fv(location, false, matrix);
            case 9:
                return gl.uniformMatrix3fv(location, false, matrix);
            case 16:
                return gl.uniformMatrix4fv(location, false, matrix);
        }
    }

    /**
     * @private
     */
    _uploadTexture() {
        this._value.glTexture
            .setContext(this._context)
            .bind(this._textureUnit);
    }

    /**
     * @private
     * @param {Object} value
     * @returns {Number}
     */
    _getLength(value) {
        if (value instanceof Array) {
            return value.length;
        }

        let len = 0;

        if ('x' in value) {
            len++;

            if ('y' in value) {
                len++;

                if ('z' in value) {
                    len++;

                    if ('w' in value) {
                        len++;
                    }
                }
            }
        }

        return len;
    }
}
