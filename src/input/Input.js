import settings from '../settings';
import EventEmitter from '../core/EventEmitter';

/**
 * @class Input
 * @extends EventEmitter
 */
export default class Input extends EventEmitter {

    /**
     * @constructor
     * @param {Set<Number>|Number[]|Number} channels
     * @param {Object} [options]
     * @param {Function} [options.start]
     * @param {Function} [options.stop]
     * @param {Function} [options.active]
     * @param {Function} [options.trigger]
     * @param {*} [options.context]
     * @param {Number} [options.threshold=settings.INPUT_THRESHOLD]
     */
    constructor(channels, { start, stop, active, trigger, context, threshold = settings.INPUT_THRESHOLD } = {}) {
        super();

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channels = new Set((typeof channels === 'number') ? [channels] : channels);

        /**
         * @private
         * @member {Number}
         */
        this._threshold = threshold;

        /**
         * @private
         * @member {Number}
         */
        this._triggered = 0;

        /**
         * @private
         * @member {Number}
         */
        this._value = 0;

        if (start) {
            this.on('start', start, context);
        }

        if (stop) {
            this.on('stop', stop, context);
        }

        if (active) {
            this.on('active', active, context);
        }

        if (trigger) {
            this.on('trigger', trigger, context);
        }
    }

    /**
     * @public
     * @member {Set<Number>}
     */
    get channels() {
        return this._channels;
    }

    set channels(channels) {
        this._channels.clear();

        for (const channel of channels) {
            this._channels.add(channel);
        }
    }

    /**
     * @public
     * @member {Number}
     */
    get threshold() {
        return this._threshold;
    }

    set threshold(threshold) {
        this._threshold = threshold;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get value() {
        return this._value;
    }

    /**
     * @public
     * @chainable
     * @param {Float32Array} channels
     * @returns {Input}
     */
    update(channels) {
        this._value = 0;

        for (const channel of this._channels) {
            this._value = Math.max(channels[channel], this._value);
        }

        if (this._value) {
            if (!this._triggered) {
                this._triggered = Date.now();
                this.trigger('start', this._value);
            }

            this.trigger('active', this._value);
        } else if (this._triggered) {
            this.trigger('stop', this._value);

            if ((Date.now() - this._triggered) < this._threshold) {
                this.trigger('trigger', this._value);
            }

            this._triggered = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._channels.clear();
        this._channels = null;

        this._threshold = null;
        this._triggered = null;
        this._value = null;
    }
}
