/**
 * @class ShaderAttribute
 * @memberof Exo
 */
export default class ShaderAttribute {

    /**
     * @constructor
     * @param {String} name
     * @param {Boolean} [active]
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
         * @member {?Number}
         */
        this._location = null;
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
     * @member {?Number}
     */
    get location() {
        return this._location;
    }

    set location(value) {
        this._location = value;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(value) {
        this._active = !!value;
    }

    /**
     * @public
     */
    destroy() {
        this._name = null;
        this._active = null;
        this._location = null;
    }
}
