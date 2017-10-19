import { ATTRIBUTE_TYPE } from '../../const';

/**
 * @class ShaderAttribute
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} [options.type]
     * @param {Number} [options.size]
     * @param {Boolean} [options.normalized=false]
     * @param {Boolean} [options.enabled=true]
     */
    constructor({ name, type, size = 1, normalized = false, enabled = true } = {}) {

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
         * @member {?RenderState}
         */
        this._renderState = null;

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
     * @member {Boolean}
     */
    get enabled() {
        return this._enabled;
    }

    set enabled(enabled) {
        this.setEnabled(enabled);
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
     * @param {Boolean} enabled
     */
    setEnabled(enabled) {
        if (this._enabled !== enabled) {
            this._enabled = enabled;

            if (this._bound) {
                this.upload();
            }
        }
    }

    /**
     * @public
     * @param {Number} stride
     * @param {Number} offset
     */
    bind(renderState, program, stride, offset) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._location = renderState.getAttributeLocation(program, this._name);

            if (this._location === -1) {
                throw new Error(`Attribute location for attribute "${this._name}" is not available.`);
            }
        }

        if (!this._bound) {
            this._bound = true;
            this._renderState.setVertexPointer(this._location, this._size, this._type, this._normalized, stride, offset);
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
        this._renderState.toggleVertexArray(this._location, this._enabled);
    }

    /**
     * @public
     */
    destroy() {
        if (this._bound) {
            this.unbind();
        }

        this._renderState = null;
        this._name = null;
        this._enabled = null;
        this._location = null;
        this._bound = null;
    }
}
