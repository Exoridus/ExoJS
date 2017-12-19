import { INPUT_CHANNELS_HANDLER, INPUT_OFFSET_POINTER, INPUT_OFFSET_GAMEPAD } from '../const';
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
     * @param {Number} [options.gamepadIndex=0]
     * @param {Number} [options.pointerIndex=0]
     * @param {Number} [options.threshold=settings.INPUT_THRESHOLD]
     */
    constructor(channels, {
        start,
        stop,
        active,
        trigger,
        context,
        gamepadIndex = 0,
        pointerIndex = 0,
        threshold = settings.INPUT_THRESHOLD,
    } = {}) {
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
        this._pointerIndex = pointerIndex;

        /**
         * @private
         * @member {Number}
         */
        this._pointerOffset = (pointerIndex * INPUT_CHANNELS_HANDLER);

        /**
         * @private
         * @member {Number}
         */
        this._gamepadIndex = gamepadIndex;

        /**
         * @private
         * @member {Number}
         */
        this._gamepadOffset = (gamepadIndex * INPUT_CHANNELS_HANDLER);

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
     * @member {Number}
     */
    get pointerIndex() {
        return this._pointerIndex;
    }

    set pointerIndex(index) {
        this._pointerIndex = index;
        this._pointerOffset = (index * INPUT_CHANNELS_HANDLER);
    }

    /**
     * @public
     * @member {Number}
     */
    get gamepadIndex() {
        return this._gamepadIndex;
    }

    set gamepadIndex(index) {
        this._gamepadIndex = index;
        this._gamepadOffset = (index * INPUT_CHANNELS_HANDLER);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get pointerOffset() {
        return this._pointerOffset;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get gamepadOffset() {
        return this._gamepadOffset;
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
     * @param {Float32Array} channels
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
    }

    /**
     * @public
     */
    destroy() {
        super.destroy();

        this._channels.clear();
        this._channels = null;

        this._threshold = null;
        this._pointerIndex = null;
        this._pointerOffset = null;
        this._gamepadIndex = null;
        this._gamepadOffset = null;
        this._triggered = null;
        this._value = null;
    }
}
