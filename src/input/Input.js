import EventEmitter from '../core/EventEmitter';

/**
 * @class Input
 * @extends {Exo.EventEmitter}
 * @memberof Exo
 */
export default class Input extends EventEmitter {

    /**
     * @constructor
     * @param {Number[]} channels
     */
    constructor(channels) {
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
         * @member {Boolean}
         */
        this._triggered = false;

        /**
         * @private
         * @member {number}
         */
        this._lastTrigger = 0;

        /**
         * @private
         * @member {number}
         */
        this._triggerThreshold = 300;
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
     * @readonly
     * @member {Boolean}
     */
    get triggered() {
        return this._triggered;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get active() {
        return this._value > 0;
    }

    /**
     * @public
     * @member {Number}
     */
    get triggerThreshold() {
        return this._triggerThreshold;
    }

    set triggerThreshold(value) {
        this._triggerThreshold = value;
    }

    /**
     * @public
     * @param {Float32Array} activeChannels
     */
    update(activeChannels) {
        this._value = 0;

        this._channels.forEach((channel) => {
            if (activeChannels[channel]) {
                this._value = Math.max(activeChannels[channel], this._value);
            }
        });

        if (this.active) {
            if (!this._triggered) {
                this._triggered = true;
                this._lastTrigger = Date.now();
                this.trigger('start', this._value);
            }

            this.trigger('active', this._value);
        } else if (this._triggered) {
            this._triggered = false;

            if (Date.now() - this._lastTrigger < this._triggerThreshold) {
                this.trigger('trigger', this._value);
            }

            this.trigger('stop', this._value);
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
        this._triggered = null;
        this._lastTrigger = null;
        this._triggerThreshold = null;
    }
}