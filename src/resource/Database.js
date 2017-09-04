import {indexedDBSupport} from '../utils';

/**
 * @class Database
 * @memberof Exo
 */
export default class Database {

    /**
     * @constructor
     * @param {String} name
     * @param {Number} version
     */
    constructor(name, version) {
        if (!indexedDBSupport) {
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
        this._connectionPromise = null;

        /**
         * @private
         * @member {Set.<String>}
         */
        this._types = new Set([
            'arrayBuffer',
            'audioBuffer',
            'audio',
            'blob',
            'image',
            'json',
            'music',
            'sound',
            'sprite',
            'text',
            'texture',
        ]);
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
        return this._connectionPromise || (this._connectionPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this._name, this._version);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                for (const type of this._types) {
                    database.createObjectStore(type, {
                        keyPath: 'key',
                    });
                }
            };

            request.onsuccess = (event) => {
                this._database = event.target.result;

                resolve(event);
            };

            request.onerror = (event) => reject(event);
        }));
    }

    /**
     * @public
     * @returns {Promise}
     */
    close() {
        if (this._database) {
            this._database.close();
            this._database = null;
        }

        this._connectionPromise = null;

        return Promise.resolve();
    }

    /**
     * @public
     * @param {?String} [type]
     * @returns {Promise}
     */
    clear(type = null) {
        if (type === null) {
            return Promise.all(this._types.map((type) => this.clear(type)));
        }

        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject();
            }));
    }

    /**
     * @public
     * @returns {Promise}
     */
    delete() {
        return this.close()
            .then(() => new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this.name);

                request.onsuccess = () => resolve();
                request.onerror = () => reject();
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Promise}
     */
    loadData(type, key) {
        return this.getObjectStore(type)
            .then((store) => new Promise((resolve, reject) => {
                const request = store.get(key);

                request.onsuccess = (event) => {
                    const result = event.target && event.target.result;

                    resolve(result && result.value);
                };
                request.onerror = () => reject();
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @param {*} value
     * @returns {Promise}
     */
    saveData(type, key, value) {
        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.put({ key, value });

                request.onsuccess = () => resolve();
                request.onerror = () => reject();
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Promise}
     */
    removeData(type, key) {
        return this.getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.delete(key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject();
            }));
    }

    /**
     * @public
     * @returns {Promise}
     */
    destroy() {
        this._types.clear();
        this._types = null;

        return this.close();
    }

    /**
     * @public
     * @param {String} type
     * @param {String} [transactionMode='readonly']
     * @returns {Promise}
     */
    getObjectStore(type, transactionMode = 'readonly') {
        if (!this._types.contains(type)) {
            return Promise.reject(`Could not find ObjectStore named "${type}".`);
        }

        return this.open()
            .then(() => this._database.transaction([type], transactionMode)
                .objectStore(type));
    }
}
