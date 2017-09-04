/**
 * @abstract
 * @class ResourceType
 * @memberof Exo
 */
export default class ResourceType {

    /**
     * @public
     * @abstract
     * @readonly
     * @member {String}
     */
    get storageKey() {
        return 'resource';
    }

    /**
     * @public
     * @abstract
     * @param {String} path
     * @param {Object} [request]
     * @param {String} [request.method='GET']
     * @param {String} [request.mode='cors']
     * @returns {Promise<Response>}
     */
    request(path, { method = 'GET', mode = 'cors' } = {}) {
        return fetch(path, { method, mode });
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
            .then((source) => this.create(source, options));
    }
}
