/**
 * @class ResourceFactory
 */
export default class ResourceFactory {

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
     * @param {String} path
     * @param {Object} [options]
     * @returns {Promise<Response>}
     */
    request(path, options) {
        return fetch(path, options);
    }

    /**
     * @public
     * @param {Response} response
     * @returns {Promise<*>}
     */
    process(response) { // eslint-disable-line
        return Promise.resolve(null);
    }

    /**
     * @public
     * @param {Response} source
     * @param {Object} [options]
     * @returns {Promise<*>}
     */
    create(source, options) { // eslint-disable-line
        return Promise.resolve(source);
    }

    /**
     * @public
     * @param {String} path
     * @param {Object} [request]
     * @param {Object} [options]
     * @returns {Promise<*>}
     */
    load(path, request, options) {
        return this
            .request(path, request)
            .then((response) => this.process(response))
            .then((source) => this.create(source, options));
    }

    /**
     * @public
     */
    destroy() {
        // do nothing
    }
}
