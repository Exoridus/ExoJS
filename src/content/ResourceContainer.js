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
         * @member {Map<String, Map<String, *>>}
         */
        this._resources = new Map();

        /**
         * @private
         * @member {Set<String>}
         */
        this._types = new Set();
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
     * @readonly
     * @member {Set<String>}
     */
    get types() {
        return this._types;
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @returns {Exo.ResourceContainer}
     */
    addType(type) {
        if (!this._types.has(type)) {
            this._resources.set(type, new Map());
            this._types.add(type);
        }

        return this;
    }

    /**
     * @public
     * @param {String} type
     * @returns {Map<String, *>}
     */
    getResources(type) {
        if (!this._types.has(type)) {
            throw new Error(`Unknown type "${type}".`);
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
     * @returns {Exo.ResourceContainer}
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
     * @returns {Exo.ResourceContainer}
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
     * @returns {Exo.ResourceContainer}
     */
    delete(type, name) {
        this.getResources(type).delete(name);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.ResourceContainer}
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

        this._types.clear();
        this._types = null;
    }
}
