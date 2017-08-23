/**
 * @class MenuPath
 */
export default class MenuPath {

    /**
     * @constructor
     * @param {MenuItem} fromItem
     * @param {MenuItem} toItem
     * @param {String} input
     */
    constructor(fromItem, toItem, input) {

        /**
         * @private
         * @member {MenuItem}
         */
        this._fromItem = fromItem;

        /**
         * @private
         * @member {MenuItem}
         */
        this._toItem = toItem;

        /**
         * @private
         * @member {String}
         */
        this._input = input;
    }

    /**
     * @public
     * @member {MenuItem}
     */
    get fromItem() {
        return this._fromItem;
    }

    set fromItem(value) {
        this._fromItem = value;
    }

    /**
     * @public
     * @member {MenuItem}
     */
    get toItem() {
        return this._toItem;
    }

    set toItem(value) {
        this._toItem = value;
    }

    /**
     * @public
     * @member {String}
     */
    get input() {
        return this._input;
    }

    set input(value) {
        this._input = value;
    }

    /**
     * @public
     */
    destroy() {
        this._fromItem = null;
        this._toItem = null;
        this._input = null;
    }
}
