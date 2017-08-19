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
        this._mapping = new Map();
    }

    /**
     * @public
     * @chainable
     * @param {String} type
     * @returns {Exo.ResourceContainer}
     */
    addType(type) {
        if (!this._mapping.has(type)) {
            this._mapping.set(type, new Map());
        }

        return this;
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Boolean}
     */
    has(type, key) {
        if (!this._mapping.has(type)) {
            return false;
        }

        return this._mapping.get(type).has(key);
    }

    /**
     * @public
     * @param {String} type
     * @param {String} key
     * @returns {Exo.ResourceContainer}
     */
    get(type, key) {
        if (!this._mapping.has(type)) {
            return null;
        }

        return this._mapping.get(type).get(key) || null;
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
        if (this._mapping.has(type)) {
            this._mapping.get(type).set(key, value);
        }

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
        if (this._mapping.has(type)) {
            this._mapping.get(type).delete(key);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.ResourceContainer}
     */
    clear() {
        this._mapping.forEach((container) => {
            container.clear();
        });

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.clear();

        this._mapping.clear();
        this._mapping = null;
    }
}
