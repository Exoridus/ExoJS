import { UNIFORM_UPLOADS, UNIFORM_VALUE } from '../const';

/**
 * @class Uniform
 */
export default class Uniform {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {String} name
     * @param {WebGLUniformLocation} location
     * @param {Number} type
     * @param {Number} size
     */
    constructor(gl, name, location, type, size) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {WebGLUniformLocation}
         */
        this._location = location;

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
         * @member {ArrayBufferView}
         */
        this._value = UNIFORM_VALUE[type]();

        /**
         * @private
         * @member {Function}
         */
        this._uploadFn = UNIFORM_UPLOADS[type];
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
     * @member {WebGLUniformLocation}
     */
    get location() {
        return this._location;
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
     * @member {ArrayBufferView}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @chainable
     * @param {ArrayBufferView|Number} value
     * @returns {Uniform}
     */
    setValue(value) {
        if (value === undefined) {
            throw new Error(`Uniform value cannot be undefined!`);
        }

        if (typeof value === 'number') {
            this._value[0] = value;
        } else {
            this._value.set(value);
        }

        this.upload();

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Uniform}
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
        this._name = null;
        this._location = null;
        this._type = null;
        this._size = null;
        this._value = null;
        this._uploadFn = null;
    }
}
