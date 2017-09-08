import {removeItems} from '../utils';

/**
 * @class EventEmitter
 * @memberof Exo
 */
export default class EventEmitter {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Map<String, Object[]>}
         */
        this._events = new Map();
    }

    /**
     * @public
     * @readonly
     * @member {Map<String, Object[]>}
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
     * @returns {Exo.EventEmitter}
     */
    on(event, callback, context = this) {
        if (!this._events) {
            return this;
        }

        const events = this._events.get(event);

        if (!events) {
            this._events.set(event, [{
                callback,
                context,
            }]);
        } else {
            events.push({
                callback,
                context,
            });
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} event
     * @param {Function} callback
     * @param {*} [context=this]
     * @returns {Exo.EventEmitter}
     */
    once(event, callback, context = this) {
        const once = (...args) => {
            this.off(event, once, context);
            callback.call(context, ...args);
        };

        return this.on(event, once, context);
    }

    /**
     * @public
     * @chainable
     * @param {String} [event='*']
     * @param {Function} [callback]
     * @param {*} [context]
     * @returns {Exo.EventEmitter}
     */
    off(event = '*', callback, context) {
        if (!this._events) {
            return this;
        }

        const mapping = this._events,
            names = (event === '*') ? Object.keys(mapping) : [event],
            lenNames = names.length;

        for (let i = 0; i < lenNames; i++) {
            const name = names[i],
                events = mapping.get(name);

            /**
             * Break for loop because only the one passed
             * event name can be wrong / not available.
             */
            if (!events) {
                break;
            }

            if (!events.length) {
                mapping.delete(name);
                continue;
            }

            if (!callback && !context) {
                removeItems(events, 0, events.length);
                mapping.delete(name);
                continue;
            }

            for (let j = events.length - 1; j >= 0; j--) {
                if (callback && (callback !== events[j].callback)) {
                    continue;
                }

                if (context && (context !== events[j].context)) {
                    continue;
                }

                removeItems(events, j, 1);
            }

            if (!events.length) {
                mapping.delete(name);
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} event
     * @param {...*} args
     * @returns {Exo.EventEmitter}
     */
    trigger(event, ...args) {
        if (!this._events) {
            return this;
        }

        const events = this._events.get(event);

        if (events) {
            for (const event of events) {
                event.callback.call(event.context, ...args);
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._events.size) {
            for (const events of this._events.values()) {
                for (const event of events) {
                    event.callback = null;
                    event.context = null;
                }

                events.length = 0;
            }
        }
        this._events.clear();
        this._events = null;
    }
}
