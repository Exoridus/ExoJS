import { TYPE_SIZES } from '../../const/rendering';

/**
 * @class ShaderAttribute
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {WebGLProgram} program
     * @param {Number} index
     */
    constructor(gl, program, index) {
        const { name, type } = gl.getActiveAttrib(program, index),
            location = gl.getAttribLocation(program, name);

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
        this._location = location;

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
        this._size = TYPE_SIZES[type];
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get location() {
        return this._location;
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
     */
    destroy() {
        this._context = null;
        this._program = null;
        this._location = null;
        this._index = null;
        this._name = null;
        this._type = null;
        this._size = null;
    }
}
