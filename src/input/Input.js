import EventEmitter from '../core/EventEmitter';
import settings from '../settings';

/**
 * @class Input
 * @extends {EventEmitter}
 */
export default class Input extends EventEmitter {

    /**
     * @constructor
     * @param {Number[]} channels
     * @param {Object} [options={}]
     * @param {Number} [options.triggerThreshold=settings.TRIGGER_THRESHOLD]
     * @param {Function} [options.start]
     * @param {Function} [options.stop]
     * @param {Function} [options.active]
     * @param {Function} [options.trigger]
     * @param {*} [options.context]
     */
    constructor(channels, {
        triggerThreshold = settings.TRIGGER_THRESHOLD,
        start,
        stop,
        active,
        trigger,
        context
    } = {}) {
        super();

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channels = new Set(channels);

        /**
         * @private
         * @member {Number}
         */
        this._value = 0;

        /**
         * @private
         * @member {Number}
         */
        this._triggerStart = 0;

        /**
         * @private
         * @member {Number}
         */
        this._triggerThreshold = triggerThreshold;

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
     * @readonly
     * @member {Set<Number>}
     */
    get channels() {
        return this._channels;
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
     * @member {Number}
     */
    get triggerThreshold() {
        return this._triggerThreshold;
    }

    set triggerThreshold(threshold) {
        this._triggerThreshold = threshold;
    }

    /**
     * @public
     * @param {Float32Array} activeChannels
     */
    update(activeChannels) {
        this._value = 0;

        for (const channel of this._channels) {
            this._value = Math.max(activeChannels[channel], this._value);
        }

        if (this._value) {
            if (!this._triggerStart) {
                this._triggerStart = Date.now();
                this.trigger('start', this._value);
            }

            this.trigger('active', this._value);
        } else {
            this.trigger('stop', this._value);

            if (this._triggerStart && (Date.now() - this._triggerStart) < this._triggerThreshold) {
                this._triggerStart = 0;
                this.trigger('trigger', this._value);
            }
        }
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._channels.clear();
        this._channels = null;

        this._value = null;
        this._triggerStart = null;
        this._triggerThreshold = null;
    }
}
