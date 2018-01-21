import { removeArrayItems } from '../utils/core';

/**
 * @typedef {Object} SignalBinding
 * @property {Function} handler
 * @property {?Object} context
 */

/**
 * @class Signal
 */
export default class Signal {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {SignalBinding[]}
         */
        this._bindings = [];
    }

    /**
     * @public
     * @readonly
     * @member {SignalBinding[]}
     */
    get bindings() {
        return this._bindings;
    }

    /**
     * @public
     * @param {Function} handler
     * @param {Object} [context]
     * @returns {Boolean}
     */
    has(handler, context) {
        return this._bindings.some((binding) => (binding.handler === handler && binding.context === context));
    }

    /**
     * @public
     * @chainable
     * @param {Function} handler
     * @param {Object} [context]
     * @returns {Signal}
     */
    add(handler, context) {
        if (!this.has(handler, context)) {
            this._bindings.push({ handler, context });
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Function} handler
     * @param {Object} [context]
     * @returns {Signal}
     */
    once(handler, context) {
        const once = (...params) => {
            this.remove(once, context);
            handler.call(context, ...params);
        };

        this.add(once, context);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Function} handler
     * @param {Object} [context]
     * @returns {Signal}
     */
    remove(handler, context) {
        const index = this._bindings.findIndex((binding) => (binding.handler === handler && binding.context === context));

        if (index !== -1) {
            this._bindings[index].handler = null;
            this._bindings[index].context = null;

            removeArrayItems(this._bindings, index, 1);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Signal}
     */
    clear() {
        for (const binding of this._bindings) {
            binding.handler = null;
            binding.context = null;
        }

        this._bindings.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {...*} params
     * @returns {Signal}
     */
    dispatch(...params) {
        if (this._bindings.length) {
            for (const binding of this._bindings) {
                if (binding.handler.call(binding.context, ...params) === false) {
                    break;
                }
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.removeAll();

        this._bindings = null;
    }
}
