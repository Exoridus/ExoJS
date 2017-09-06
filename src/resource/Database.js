import {indexedDBSupported} from '../utils';

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
        if (!indexedDBSupported) {
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
         * @member {Set.<String>}
         */
        this._types = new Set([
            'arrayBuffer',
            'audioBuffer',
            'audio',
            'font',
            'image',
            'json',
            'music',
            'sound',
            'string',
        ]);

        /**
         * @private
         * @member {Function}
         */
        this._onCloseHandler = this.close.bind(this);
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
                const types = this._types,
                    database = event.target.result,
                    transaction = event.target.transaction,
                    currentStores = [...transaction.objectStoreNames];

                database.addEventListener('error', (event) => reject(event));
                database.addEventListener('abort', (event) => reject(event));

                for (const store of currentStores) {
                    if (!types.has(store)) {
                        database.deleteObjectStore(store);
                    }
                }

                for (const type of types) {
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
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.close();
            this._database = null;
        }

        this._connect = null;

        return Promise.resolve();
    }

    /**
     * @public
     * @param {String} type
     * @param {String} [transactionMode='readonly']
     * @returns {Promise}
     */
    getObjectStore(type, transactionMode = 'readonly') {
        if (!this._types.has(type)) {
            return Promise.reject(Error(`Could not find ObjectStore named "${type}".`));
        }

        return this
            .open()
            .then(() => this._database
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
            return [...this._types].reduce((promise, type) => promise.then(() => this.clear(type)), Promise.resolve());
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
    delete() {
        return this
            .close()
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
     * @returns {Promise.<Object>}
     */
    loadData(type, name) {
        return this
            .getObjectStore(type)
            .then((store) => new Promise((resolve, reject) => {
                const request = store.get(name);

                request.addEventListener('success', (event) => {
                    const result = event.target.result,
                        data = (result && result.value) || null;

                    resolve({ data, type, name });
                });

                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @param {*} data
     * @returns {Promise.<Object>}
     */
    saveData(type, name, data) {
        return this
            .getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.put({ key: name, value: data });

                request.addEventListener('success', () => resolve({ type, name, data }));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Promise.<Object>}
     */
    removeData(type, name) {
        return this
            .getObjectStore(type, 'readwrite')
            .then((store) => new Promise((resolve, reject) => {
                const request = store.delete(name);

                request.addEventListener('success', () => resolve({ type, name }));
                request.addEventListener('error', (event) => reject(event));
            }));
    }

    /**
     * @public
     */
    destroy() {
        if (this._database) {
            this._database.removeEventListener('close', this._onCloseHandler);
            this._database.close();
            this._database = null;
        }

        this._types.clear();
        this._types = null;

        this._name = null;
        this._version = null;
        this._connect = null;
        this._onCloseHandler = null;
        this._onUpgradeNeededHandler = null;
    }
}
