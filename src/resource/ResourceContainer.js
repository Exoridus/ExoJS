/**
 * @class ResourceContainer
 * @memberOf Exo
 */
export default class ResourceContainer {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Map.<String, Map.<String, *>>}
         */
        this._resources = new Map();
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @returns {Exo.ResourceContainer}
     */
    addType(type) {
        if (!this._resources.has(type)) {
            this._resources.set(type, new Map());
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @returns {Exo.ResourceContainer}
     */
    getType(type) {
        const resources = this._resources.get(type);

        if (!resources) {
            throw new Error(`Invalid type "${type}".`);
        }

        return resources;
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Boolean}
     */
    has(type, key) {
        return this.getType(type).has(key);
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Exo.ResourceContainer}
     */
    get(type, key) {
        const resources = this.getType(type);

        if (!resources.has(key)) {
            throw new Error(`Could not find resource "${key}" with type "${type}".`);
        }

        return resources.get(key);
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} key
     * @param {*} value
     * @returns {Exo.ResourceContainer}
     */
    set(type, key, value) {
        this.getType(type).set(key, value);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} key
     * @returns {Exo.ResourceContainer}
     */
    delete(type, key) {
        this.getType(type).delete(key);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.ResourceContainer}
     */
    clear() {
        this._resources.forEach((container) => {
            container.clear();
        });

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.clear();

        this._resources.clear();
        this._resources = null;
    }
}
