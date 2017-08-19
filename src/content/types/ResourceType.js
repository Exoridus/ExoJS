/**
 * @interface ResourceType
 * @memberof Exo
 */
export default class ResourceType {

    /**
     * @public
     * @virtual
     * @param {String} path
     * @returns {Promise}
     */
    loadSource(path) {
        return Promise.resolve(null);
    }

    /**
     * @public
     * @virtual
     * @param {*} source
     * @returns {Promise}
     */
    create(source) {
        return Promise.resolve(source);
    }

    /**
     * @public
     * @virtual
     * @param {String} path
     * @returns {Promise}
     */
    load(path) {
        return this.loadSource(path).then((source) => this.create(source));
    }
}
