import { ATTRIBUTE_TYPE } from '../../const';

/**
 * @class ShaderAttribute
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {Object} options
     * @param {String} options.name
     * @param {Number} options.type
     * @param {Number} options.size
     * @param {Boolean} [options.normalized=false]
     * @param {Boolean} [options.enabled=true]
     * @param {Number} [options.location=null]
     */
    constructor({ name, type, size, normalized = false, enabled = true, location = null } = {}) {

        /**
         * @private
         * @member {Number}
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
         * @member {Boolean}
         */
        this._normalized = normalized;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = enabled;
    }

    /**
     * @public
     * @member {Number}
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
     * @member {Boolean}
     */
    get normalized() {
        return this._normalized;
    }

    set normalized(normalized) {
        this._normalized = normalized;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get enabled() {
        return this._enabled;
    }

    set enabled(enabled) {
        this._enabled = enabled;
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
     */
    destroy() {
        this._location = null;
        this._name = null;
        this._type = null;
        this._size = null;
        this._normalized = null;
        this._enabled = null;
    }
}
