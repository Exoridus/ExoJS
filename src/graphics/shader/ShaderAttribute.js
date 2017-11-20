import { ATTRIBUTE_TYPE } from '../../const';

/**
 * @class ShaderAttribute
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} type
     * @param {Number} size
     * @param {Boolean} [normalized=false]
     * @param {Boolean} [enabled=true]
     */
    constructor(name, type, size, normalized = false, enabled = true) {

        /**
         * @private
         * @member {?Program}
         */
        this._program = null;

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
         * @member {Boolean}
         */
        this._normalized = normalized;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = enabled;

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
     * @member {Number}
     */
    get size() {
        return this._size;
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
     * @member {Boolean}
     */
    get normalized() {
        return this._normalized;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get byteSize() {
        return this.bytesType * this._size;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get bytesType() {
        switch (this._type) {
            case ATTRIBUTE_TYPE.BYTE:
            case ATTRIBUTE_TYPE.UNSIGNED_BYTE:
                return 1;
            case ATTRIBUTE_TYPE.SHORT:
            case ATTRIBUTE_TYPE.UNSIGNED_SHORT:
                return 2;
            case ATTRIBUTE_TYPE.INT:
            case ATTRIBUTE_TYPE.UNSIGNED_INT:
            case ATTRIBUTE_TYPE.FLOAT:
                return 4;
        }

        return 0;
    }

    /**
     * @public
     * @chainable
     * @param {Boolean} enabled
     * @returns {ShaderAttribute}
     */
    setEnabled(enabled) {
        if (this._enabled !== enabled) {
            this._enabled = enabled;
            this.upload();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Program} program
     * @param {Number} stride
     * @param {Number} offset
     * @returns {ShaderAttribute}
     */
    bind(program, stride, offset) {
        if (!this._program) {
            this._program = program;
        }

        if (!this._bound) {
            this._bound = true;
            this._program.setVertexPointer(this._name, this._size, this._type, this._normalized, stride, offset);
            this.upload();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderAttribute}
     */
    unbind() {
        this._bound = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ShaderAttribute}
     */
    upload() {
        if (this._bound) {
            this._program.toggleVertexArray(this._name, this._enabled);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._program = null;
        this._name = null;
        this._type = null;
        this._size = null;
        this._normalized = null;
        this._enabled = null;
        this._bound = null;
    }
}
