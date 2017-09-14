/**
 * @abstract
 * @class ResourceFactory
 */
export default class ResourceFactory {

    /**
     * @public
     * @abstract
     * @readonly
     * @member {String}
     */
    get storageType() {
        return 'resource';
    }

    /**
     * @public
     * @abstract
     * @param {String} path
     * @param {Object} [options]
     * @param {String} [options.method='GET']
     * @param {String} [options.mode='cors']
     * @param {String} [options.cache='default']
     * @returns {Promise<Response>}
     */
    request(path, options = {
        method: 'GET',
        mode: 'cors',
        cache: 'default',
    }) {
        return fetch(path, options);
    }

    /**
     * @public
     * @abstract
     * @param {Response} response
     * @returns {Promise<*>}
     */
    process(response) {
        return Promise.resolve(null);
    }

    /**
     * @public
     * @abstract
     * @param {Response} source
     * @param {Object} [options]
     * @returns {Promise<*>}
     */
    create(source, options) {
        return Promise.resolve(source);
    }

    /**
     * @public
     * @abstract
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
     * @abstract
     */
    destroy() {
        // do nothing
    }
}
