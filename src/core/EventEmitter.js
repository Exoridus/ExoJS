import { removeArrayItems } from '../utils/core';

/**
 * @typedef {Object} EventHandler
 * @property {Function} callback
 * @property {*} context
 */

/**
 * @class EventEmitter
 */
export default class EventEmitter {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Object<String, EventHandler[]>}
         */
        this._events = {};
    }

    /**
     * @public
     * @readonly
     * @member {Object<String, EventHandler[]>}
     */
    get events() {
        return this._events;
    }

    /**
     * @public
     * @chainable
     * @param {String} event
     * @param {Function} callback
     * @param {*} [context=this]
     * @returns {EventEmitter}
     */
    on(event, callback, context = this) {
        if (this._events) {
            const events = this._events[event];

            if (!events) {
                this._events[event] = [{ callback, context }];
            } else {
                events.push({ callback, context });
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} event
     * @param {Function} callback
     * @param {*} [context=this]
     * @returns {EventEmitter}
     */
    once(event, callback, context = this) {
        if (this._events) {
            const once = (...args) => {
                this.off(event, once, context);
                callback.call(context, ...args);
            };

            return this.on(event, once, context);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} [event='*']
     * @param {Function} [callback]
     * @param {*} [context]
     * @returns {EventEmitter}
     */
    off(event = '*', callback, context) {
        if (!this._events) {
            return this;
        }

        const names = (event === '*') ? Object.keys(this._events) : [event];

        for (const name of names) {
            const handlers = this._events[name];

            /**
             * Break for loop because only the one passed
             * event name can be wrong / not available.
             */
            if (!handlers) {
                break;
            }

            if (!handlers.length) {
                delete this._events[name];

                continue;
            }

            if (!callback && !context) {
                for (const handler of handlers) {
                    handler.callback = null;
                    handler.context = null;
                }
                handlers.length = 0;

                delete this._events[name];

                continue;
            }

            for (let j = handlers.length - 1; j >= 0; j--) {
                if (callback && (callback !== handlers[j].callback)) {
                    continue;
                }

                if (context && (context !== handlers[j].context)) {
                    continue;
                }

                handlers[j].callback = null;
                handlers[j].context = null;

                removeArrayItems(handlers, j, 1);
            }

            if (!handlers.length) {
                delete this._events[name];
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} event
     * @param {...*} args
     * @returns {EventEmitter}
     */
    trigger(event, ...args) {
        if (this._events && this._events[event]) {
            for (const handler of this._events[event]) {
                handler.callback.call(handler.context, ...args);
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.off();

        this._events = null;
    }
}
