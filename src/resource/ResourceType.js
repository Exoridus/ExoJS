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
     * @returns {Promise}
     */
    loadSource(path, { method = 'GET', mode = 'cors' } = {}) {
        return fetch(path, { method, mode });
    }

    /**
     * @public
     * @abstract
     * @param {*} source
     * @param {Object} [options]
     * @returns {Promise}
     */
    create(source, options) {
        return Promise.resolve(source);
    }

    /**
     * @public
     * @abstract
     * @param {String} path
     * @param {Object} [options]
     * @returns {Promise}
     */
    load(path, options) {
        return this
            .loadSource(path)
            .then((source) => this.create(source, options));
    }
}
