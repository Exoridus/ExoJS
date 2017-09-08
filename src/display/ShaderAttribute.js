/**
 * @class ShaderAttribute
 * @memberof Exo
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {String} name
     * @param {Boolean} active
     */
    constructor(name, active) {

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Boolean}
         */
        this._active = active;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?Number}
         */
        this._location = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
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
     * @member {?Number}
     */
    get location() {
        return this._location;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(value) {
        if (this._active !== active) {
            this._active = active;
            this._upload();
        }
    }

    /**
     * @public
     * @param {WebGLRenderingContext} gl
     * @param {WebGLProgram} program
     */
    setContext(gl, program) {
        if (!this._context) {
            this._context = gl;
            this._location = gl.getAttribLocation(program, this._name);

            if (this._location === -1) {
                throw new Error(`Attribute location for attribute "${this._name}" is not available.`)
            }
        }
    }

    /**
     * @public
     * @param {Number} size
     * @param {Number} type
     * @param {boolean} normalized
     * @param {Number} stride
     * @param {Number} offset
     */
    setPointer(size, type, normalized, stride, offset) {
        this._context.vertexAttribPointer(this._location, size, type, normalized, stride, offset);
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
        this._context = null;
        this._name = null;
        this._active = null;
        this._location = null;
        this._bound = null;
    }

    /**
     * @private
     */
    _upload() {
        if (!this._bound) {
            return;
        }

        if (this._active) {
            this._context.enableVertexAttribArray(this._location);
        } else {
            this._context.disableVertexAttribArray(this._location);
        }
    }
}
