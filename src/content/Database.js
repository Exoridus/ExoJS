/**
 * @typedef {Object} DatabaseResult
 * @property {String} type
 * @property {String} name
 * @property {?Object} data
 */

/**
 * @class Database
 */
export default class Database {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} version
     */
    constructor(name, version) {

        /**
         * @private
         * @member {String}
         */
        this._name = name;

        /**
         * @private
         * @member {Number}
         */
        this._version = version;

        /**
         * @private
         * @member {Boolean}
         */
        this._connected = false;
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
    get version() {
        return this._version;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get connected() {
        return this._connected;
    }

    set connected(connected) {
        this._connected = connected;
    }

    /**
     * @public
     * @returns {Promise}
     */
    connect() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @returns {Promise}
     */
    disconnect() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Promise<DatabaseResult>}
     */
    load(type, name) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @param {Object} data
     * @returns {Promise<DatabaseResult>}
     */
    save(type, name, data) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Promise<DatabaseResult>}
     */
    delete(type, name) {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @param {String} [type='*']
     * @returns {Promise}
     */
    clearStorage(type = '*') {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @returns {Promise}
     */
    deleteStorage() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._name = null;
        this._version = null;
        this._connected = null;
    }
}
