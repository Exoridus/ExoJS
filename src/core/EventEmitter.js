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
         * @member {Map<String, Function>}
         */
        this._events = new Map();
    }

    /**
     * @public
     * @param {String} eventName
     * @param {Function} callback
     * @param {*} [context]
     * @returns {Exo.EventEmitter}
     */
    on(eventName, callback, context) {
        if (!this._events.has(eventName)) {
            this._events.set(eventName, []);
        }

        this._events.get(eventName).push({
            callback,
            context: context || this,
        });

        return this;
    }

    /**
     * @public
     * @param {String} eventName
     * @param {Function} callback
     * @param {*} [context]
     * @returns {Exo.EventEmitter}
     */
    once(eventName, callback, context) {
        const once = () => {
            this.off(eventName, once, context);
            callback.apply(this, arguments);
        };

        return this.on(eventName, once, context);
    }

    /**
     * @public
     * @param {String} [eventName='*']
     * @param {Function} [callback]
     * @param {*} [context]
     * @returns {Exo.EventEmitter}
     */
    off(eventName = '*', callback, context) {
        const eventNames = (eventName === '*') ? Object.keys(this._events) : [
            eventName,
        ];

        eventNames.forEach((name) => { // eslint-disable-line
            const eventList = this._events.get(name);

            /**
             * Break foreach because only the one passed
             * event name can be wrong / not available.
             */
            if (!eventList) {
                return false;
            }

            if (!callback && !context) {
                eventList.length = 0;
                this._events.delete(name);

                return true;
            }

            for (let i = eventList.length - 1; i >= 0; i--) {
                const event = eventList[i];

                if ((callback && callback !== event.callback) || (context && context !== event.context)) {
                    continue;
                }

                eventList.splice(i, 1);
            }
        });

        return this;
    }

    /**
     * @public
     * @param {String} eventName
     * @returns {Exo.EventEmitter}
     */
    trigger(eventName) {
        if (!this._events.has(eventName)) {
            return this;
        }

        const events = this._events.get(eventName),
            length = events.length,
            args = Array.prototype.slice.call(arguments, 1);

        for (let i = 0; i < length; i++) {
            const event = events[i];

            switch (args.length) {
                case 0:
                    event.callback.call(event.context);
                    break;
                case 1:
                    event.callback.call(event.context, args[0]);
                    break;
                case 2:
                    event.callback.call(event.context, args[0], args[1]);
                    break;
                case 3:
                    event.callback.call(event.context, args[0], args[1], args[2]);
                    break;
                default:
                    event.callback.apply(event.context, args);
                    break;
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.off();
    }
}
