import { DATABASE_TYPES } from '../const';
import support from '../support';

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
     * @constructs Database
     * @param {String} name
     * @param {Number} version
     */
    constructor(name, version) {
        if (!support.indexedDB) {
            throw new Error('This browser does not support indexedDB!');
        }

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
         * @member {?IDBDatabase}
         */
        this._database = null;

        /**
         * @private
         * @member {?Promise}
         */
        this._connect = null;

        /**
         * @private
         * @member {Function}
         */
        this._onCloseHandler = this._closeConnection.bind(this);
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
     * @readonly
     * @member {Boolean}
     */
    get isOpen() {
        return this._database !== null;
    }

    /**
     * @public
     * @returns {Promise}
     */
    open() {
        return this._connect || (this._connect = new Promise((resolve, reject) => {
            const request = indexedDB.open(this._name, this._version);

            request.addEventListener('upgradeneeded', (event) => {
                const database = event.target.result,
                    transaction = event.target.transaction,
                    currentStores = [...transaction.objectStoreNames];

                database.addEventListener('error', (event) => reject(event));
                database.addEventListener('abort', (event) => reject(event));

                for (const store of currentStores) {
                    if (!DATABASE_TYPES.includes(store)) {
                        database.deleteObjectStore(store);
                    }
                }

                for (const type of DATABASE_TYPES) {
                    if (!currentStores.includes(type)) {
                        database.createObjectStore(type, { keyPath: 'name' });
                    }
                }
            });

            request.addEventListener('success', (event) => {
                this._database = event.target.result;
                this._database.addEventListener('close', this._onCloseHandler);
                this._database.addEventListener('versionchange', this._onCloseHandler);

                resolve(this._database);
            });

            request.addEventListener('error', (event) => reject(event));
            request.addEventListener('blocked', (event) => reject(event));
        }));
    }

    /**
     * @public
     * @returns {Promise}
     */
    close() {
        this._closeConnection();

        return Promise.resolve();
    }

    /**
     * @public
     * @param {String} type
     * @param {String} [transactionMode='readonly']
     * @returns {Promise}
     */
    getObjectStore(type, transactionMode = 'readonly') {
        if (!DATABASE_TYPES.includes(type)) {
            return Promise.reject(Error(`Could not find ObjectStore named "${type}".`));
        }

        return this.open()
            .then((database) => database
                .transaction([type], transactionMode)
                .objectStore(type));
    }

    /**
     * @public
     * @param {String} [type='*']
     * @returns {Promise}
     */
    clear(type = '*') {
        if (type === '*') {
            return DATABASE_TYPES.reduce((promise, type) => promise.then(() => this.clear(type)), Promise.resolve());
        }

        return this
            .getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.clear();

                request.addEventListener('success', (event) => resolve(event));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @returns {Promise}
     */
    deleteDatabase() {
        return this.close()
            .then(() => new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this._name);

                request.addEventListener('success', (event) => resolve(event));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Promise<DatabaseResult>}
     */
    loadData(type, name) {
        return this
            .getObjectStore(type)
            .then((store) => new Promise((resolve, reject) => {
                const request = store.get(name);

                request.addEventListener('success', (event) => {
                    const result = event.target.result,
                        data = (result && result.data) || null;

                    resolve({ type, name, data });
                });

                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @param {Object} data
     * @returns {Promise<DatabaseResult>}
     */
    saveData(type, name, data) {
        return this
            .getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.put({ name, data });

                request.addEventListener('success', () => resolve({ type, name, data }));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Promise<DatabaseResult>}
     */
    removeData(type, name) {
        return this
            .getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.delete(name);

                request.addEventListener('success', () => resolve({ type, name, data: null }));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     */
    destroy() {
        this._closeConnection();

        this._name = null;
        this._version = null;
        this._onCloseHandler = null;
    }

    /**
     * @private
     */
    _closeConnection() {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
            this._database = null;
        }

        this._connect = null;
    }
}
