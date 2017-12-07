import { DATABASE_TYPES } from '../const';
import support from '../support';
import Database from './Database';

/**
 * @class IDBDatabase
 * @extends Database
 */
export default class IDBDatabase extends Database {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} version
     */
    constructor(name, version) {
        if (!support.indexedDB) {
            throw new Error('This browser does not support indexedDB!');
        }

        super(name, version);

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
        this._onCloseHandler = this.disconnect.bind(this);
    }

    /**
     * @public
     * @param {String} type
     * @param {String} [transactionMode='readonly']
     * @returns {Promise}
     */
    getObjectStore(type, transactionMode = 'readonly') {
        if (!DATABASE_TYPES.includes(type)) {
            return Promise.reject(Error(`The object store named "${type}" could not be found.`));
        }

        return this.connect()
            .then(() => this._database
                .transaction([type], transactionMode)
                .objectStore(type));
    }

    /**
     * @override
     */
    connect() {
        return this._connect || (this._connect = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.addEventListener('upgradeneeded', (event) => {
                const database = event.target.result,
                    transaction = event.target.transaction,
                    currentStores = [...transaction.objectStoreNames];

                database.addEventListener('error', (event) => reject(Error('An error occurred while opening the database.')));
                database.addEventListener('abort', (event) => reject(Error('The database opening was aborted.')));

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
                this.connected = true;

                resolve();
            });

            request.addEventListener('error', (event) => reject(Error('An error occurred while requesting the database connection.')));
            request.addEventListener('blocked', (event) => reject(Error('The request for the database connection has been blocked.')));
        }));
    }

    /**
     * @override
     */
    disconnect() {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
            this._database = null;
            this.connected = false;
        }

        this._connect = null;

        return Promise.resolve();
    }

    /**
     * @override
     */
    load(type, name) {
        return this.getObjectStore(type)
            .then((store) => new Promise((resolve, reject) => {
                const request = store.get(name);

                request.addEventListener('success', (event) => {
                    const result = event.target.result,
                        data = (result && result.data) || null;

                    resolve({ type, name, data });
                });

                request.addEventListener('error', (event) => reject(Error('An error occurred while loading an item.')));
            }));
    }

    /**
     * @override
     */
    save(type, name, data) {
        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.put({ name, data });

                request.addEventListener('success', () => resolve({ type, name, data }));
                request.addEventListener('error', (event) => reject(Error('An error occurred while saving an item.')));
            }));
    }

    /**
     * @override
     */
    delete(type, name) {
        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.delete(name);

                request.addEventListener('success', () => resolve({ type, name, data: null }));
                request.addEventListener('error', (event) => reject(Error('An error occurred while deleting an item.')));
            }));
    }

    /**
     * @override
     */
    clearStorage(type = '*') {
        if (type === '*') {
            return DATABASE_TYPES.reduce((promise, type) => promise.then(() => this.clearStorage(type)), Promise.resolve());
        }

        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.clear();

                request.addEventListener('success', (event) => resolve());
                request.addEventListener('error', (event) => reject(Error('An error occurred while clearing a storage.')));
            }));
    }

    /**
     * @override
     */
    deleteStorage() {
        return this.disconnect()
            .then(() => new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this._name);

                request.addEventListener('success', (event) => resolve(event));
                request.addEventListener('error', (event) => reject(Error('An error occurred while deleting a storage.')));
            }));
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._onCloseHandler = null;
        this._database = null;
        this._connect = null;
    }
}
