import settings from '../settings';
import Signal from '../core/Signal';
import Timer from '../core/time/Timer';

/**
 * @class Input
 */
export default class Input {

    /**
     * @constructor
     * @param {Set<Number>|Number[]|Number} channels
     * @param {Object} [options]
     * @param {Function} [options.onStart]
     * @param {Function} [options.onStop]
     * @param {Function} [options.onActive]
     * @param {Function} [options.onTrigger]
     * @param {Object} [options.context]
     * @param {Number} [options.threshold=settings.INPUT_THRESHOLD]
     */
    constructor(channels, { onStart, onStop, onActive, onTrigger, context, threshold = settings.INPUT_THRESHOLD } = {}) {

        /**
         * @private
         * @member {Set<Number>}
         */
        this._channels = new Set((typeof channels === 'number') ? [channels] : channels);

        /**
         * @private
         * @member {Timer}
         */
        this._triggerTimer = new Timer({ limit: threshold });

        /**
         * @private
         * @member {Signal}
         */
        this._onStart = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onStop = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onActive = new Signal();

        /**
         * @private
         * @member {Signal}
         */
        this._onTrigger = new Signal();

        /**
         * @private
         * @member {Number}
         */
        this._value = 0;

        if (onStart) {
            this._onStart.add(onStart, context);
        }

        if (onStop) {
            this._onStop.add(onStop, context);
        }

        if (onActive) {
            this._onActive.add(onActive, context);
        }

        if (onTrigger) {
            this._onTrigger.add(onTrigger, context);
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
     * @readonly
     * @member {Signal}
     */
    get onStart() {
        return this._onStart;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onStop() {
        return this._onStop;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onActive() {
        return this._onActive;
    }

    /**
     * @public
     * @readonly
     * @member {Signal}
     */
    get onTrigger() {
        return this._onTrigger;
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
            if (!this._triggerTimer.running) {
                this._triggerTimer.restart();
                this._onStart.dispatch(this._value);
            }

            this._onActive.dispatch(this._value);
        } else if (this._triggerTimer.running) {
            this._onStop.dispatch(this._value);

            if (this._triggerTimer.expired) {
                this._onTrigger.dispatch(this._value);
            }

            this._triggerTimer.stop();
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._channels.clear();
        this._channels = null;

        this._triggerTimer.destroy();
        this._triggerTimer = null;

        this._onStart.destroy();
        this._onStart = null;

        this._onStop.destroy();
        this._onStop = null;

        this._onActive.destroy();
        this._onActive = null;

        this._onTrigger.destroy();
        this._onTrigger = null;

        this._value = null;
    }
}
