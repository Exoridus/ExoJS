/**
 * @class ResourceFactory
 */
export default class ResourceFactory {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {String[]}
         */
        this._objectURLs = [];
    }

    /**
     * @public
     * @readonly
     * @member {String}
     */
    get storageType() {
        return 'resource';
    }

    /**
     * @public
     * @readonly
     * @member {String[]}
     */
    get objectURLs() {
        return this._objectURLs;
    }

    /**
     * @public
     * @param {String} path
     * @param {Object} [options]
     * @returns {Promise<Response>}
     */
    async request(path, options) {
        return await fetch(path, options);
    }

    /**
     * @public
     * @param {Response} response
     * @returns {Promise<*>}
     */
    async process(response) { // eslint-disable-line
        return null;
    }

    /**
     * @public
     * @param {*} source
     * @param {Object} [options]
     * @returns {Promise<*>}
     */
    async create(source, options) { // eslint-disable-line
        return source;
    }

    /**
     * @public
     * @param {Blob} blob
     * @returns {String}
     */
    createObjectURL(blob) {
        const objectURL = URL.createObjectURL(blob);

        this._objectURLs.push(objectURL);

        return objectURL;
    }

    /**
     * @public
     */
    destroy() {
        for (const objectURL of this._objectURLs) {
            URL.revokeObjectURL(objectURL);
        }

        this._objectURLs.length = 0;
        this._objectURLs = null;
    }
}
