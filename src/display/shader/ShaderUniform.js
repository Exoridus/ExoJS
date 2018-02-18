import { TYPE_CLASSES, TYPE_NAMES, TYPE_UPLOADS } from '../../const';

/**
 * @class ShaderUniform
 */
export default class ShaderUniform {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLProgram} program
     * @param {Number} index
     * @param {Number} type
     * @param {Number} size
     * @param {String} name
     * @param {ArrayBufferView} data
     */
    constructor(gl, program, index, type, size, name, data) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @private
         * @member {WebGLProgram}
         */
        this._program = program;

        /**
         * @private
         * @member {Number}
         */
        this._index = index;

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
         * @member {String}
         */
        this._name = name.replace(/\[.*?]/, '');

        /**
         * @private
         * @member {WebGLUniformLocation}
         */
        this._location = gl.getUniformLocation(program, this._name);

        /**
         * @private
         * @member {ArrayBufferView}
         */
        this._value = data;

        /**
         * @private
         * @member {Function}
         */
        this._uploadFn = TYPE_UPLOADS[type];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get index() {
        return this._index;
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
     * @member {String}
     */
    get namespace() {
        return this._name.substr(this._name.lastIndexOf('.') + 1);
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
     * @member {Number}
     */
    get size() {
        return this._size;
    }

    /**
     * @public
     * @readonly
     * @member {WebGLUniformLocation}
     */
    get location() {
        return this._location;
    }

    /**
     * @public
     * @member {ArrayBufferView}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @chainable
     * @param {ArrayBufferView} value
     * @returns {ShaderUniform}
     */
    setValue(value) {
        if (value === undefined) {
            throw new Error(`Uniform value cannot be undefined!`);
        }

        this._value.set(value);
        this.upload();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderUniform}
     */
    upload() {
        if (this._location) {
            this._uploadFn(this._context, this._location, this._value);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context = null;
        this._program = null;
        this._index = null;
        this._name = null;
        this._type = null;
        this._size = null;
        this._value = null;
        this._location = null;
        this._uploadFn = null;
    }
}
