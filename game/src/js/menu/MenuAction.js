const emptyFunction = () => {
    // do nothing
};

/**
 * @class MenuAction
 */
export default class MenuAction {

    /**
     * @constructor
     * @param {MenuItem} item
     * @param {Function} action
     * @param {String} [input=select]
     */
    constructor(item, action, input = 'select') {

        /**
         * @private
         * @member {MenuItem}
         */
        this._item = item;

        /**
         * @private
         * @member {Function}
         */
        this._action = action || emptyFunction;

        /**
         * @private
         * @member {String}
         */
        this._input = input;
    }

    /**
     * @public
     * @member {MenuItem}
     * @memberof MenuAction#
     */
    get item() {
        return this._item;
    }

    set item(value) {
        this._item = value;
    }

    /**
     * @public
     * @member {Function}
     * @memberof MenuAction#
     */
    get action() {
        return this._action;
    }

    set action(value) {
        this._action = value;
    }

    /**
     * @public
     * @member {String}
     * @memberof MenuAction#
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
        this._item = null;
        this._action = null;
        this._input = null;
    }
}
