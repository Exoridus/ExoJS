/**
 * @class Property
 */
export default class Property {

    /**
     * @constructor
     * @param {String} name
     */
    constructor(name) {

        /**
         * @private
         * @member {String}
         */
        this._name = name;
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
     */
    destroy() {
        this._name = null;
    }
}
