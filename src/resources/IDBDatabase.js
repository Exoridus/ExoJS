import { DATABASE_TYPES } from '../const/core';
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
    async getObjectStore(type, transactionMode = 'readonly') {
        if (!DATABASE_TYPES.includes(type)) {
            throw new Error(`The object store named "${type}" could not be found.`);
        }

        await this.connect();

        return this._database
            .transaction([type], transactionMode)
            .objectStore(type);
    }

    /**
     * @override
     */
    async connect() {
        return new Promise((resolve, reject) => {
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
        });
    }

    /**
     * @override
     */
    async disconnect() {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.removeEventListener('versionchange', this._onCloseHandler);
            this._database.close();
            this._database = null;
            this.connected = false;
        }

        return this;
    }

    /**
     * @override
     */
    async load(type, name) {
        const store = await this.getObjectStore(type);

        return new Promise((resolve, reject) => {
            const request = store.get(name);

            request.addEventListener('success', (event) => {
                const result = event.target.result;

                resolve((result && result.data) || null);
            });

            request.addEventListener('error', (event) => reject(Error('An error occurred while loading an item.')));
        });
    }

    /**
     * @override
     */
    async save(type, name, data) {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.put({ name, data });

            request.addEventListener('success', (event) => resolve(event));
            request.addEventListener('error', (event) => reject(Error('An error occurred while saving an item.')));
        });
    }

    /**
     * @override
     */
    async delete(type, name) {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.delete(name);

            request.addEventListener('success', (event) => resolve(event));
            request.addEventListener('error', (event) => reject(Error('An error occurred while deleting an item.')));
        });
    }

    /**
     * @override
     */
    async clearStorage(type) {
        const store = await this.getObjectStore(type, 'readwrite');

        return new Promise((resolve, reject) => {
            const request = store.clear();

            request.addEventListener('success', (event) => resolve(event));
            request.addEventListener('error', (event) => reject(Error('An error occurred while clearing a storage.')));
        });
    }

    /**
     * @override
     */
    async deleteStorage() {
        await this.disconnect();

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this._name);

            request.addEventListener('success', (event) => resolve(event));
            request.addEventListener('error', (event) => reject(Error('An error occurred while deleting a storage.')));
        });
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._onCloseHandler = null;
        this._database = null;
    }
}
