/**
 * @class ResourceCollection
 */
export default class ResourceCollection {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Map<String, Map<String, *>>}
         */
        this._resources = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, Map<String, *>>}
     */
    get resources() {
        return this._resources;
    }

    /**
     * @public
     * @param {String} type
     * @returns {Map<String, *>}
     */
    getResources(type) {
        if (!this._resources.has(type)) {
            this._resources.set(type, new Map());
        }

        return this._resources.get(type);
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {Boolean}
     */
    has(type, name) {
        return this.getResources(type).has(name);
    }

    /**
     * @public
     * @param {String} type
     * @param {String} name
     * @returns {*}
     */
    get(type, name) {
        const resources = this.getResources(type);

        if (!resources.has(name)) {
            throw new Error(`Missing resource "${name}" with type "${type}".`);
        }

        return resources.get(name);
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} name
     * @param {*} resource
     * @returns {ResourceCollection}
     */
    set(type, name, resource) {
        this.getResources(type).set(name, resource);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @param {String} name
     * @returns {ResourceCollection}
     */
    remove(type, name) {
        this.getResources(type).delete(name);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ResourceCollection}
     */
    clear() {
        for (const container of this._resources.values()) {
            container.clear();
        }

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
