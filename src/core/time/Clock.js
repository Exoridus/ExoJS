import { TIME } from '../../const/core';
import Time from './Time';
import { getPreciseTime } from '../../utils/core';

/**
 * @class Clock
 */
export default class Clock {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number} [options.start=0]
     * @param {Number} [options.factor=TIME.MILLISECONDS]
     * @param {Boolean} [options.autoStart=false]
     */
    constructor({ start = 0, factor = TIME.MILLISECONDS, autoStart = false } = {}) {

        /**
         * @private
         * @member {Number}
         */
        this._startTime = (start * factor);

        /**
         * @private
         * @member {Time}
         */
        this._time = new Time();

        /**
         * @private
         * @member {Boolean}
         */
        this._running = false;

        if (autoStart) {
            this.start();
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get running() {
        return this._running;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get time() {
        return this._time;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get startTime() {
        return this._startTime;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get elapsedTime() {
        if (this._running) {
            const now = getPreciseTime();

            this._time.add(now - this._startTime);
            this._startTime = now;
        }

        return this._time;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedMilliseconds() {
        return this.elapsedTime.milliseconds;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedSeconds() {
        return this.elapsedTime.seconds;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedMinutes() {
        return this.elapsedTime.minutes;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedHours() {
        return this.elapsedTime.hours;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    start() {
        if (!this._running) {
            this._running = true;
            this._startTime = getPreciseTime();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    stop() {
        if (this._running) {
            this._running = false;
            this._time.add(getPreciseTime() - this._startTime);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    reset() {
        this._running = false;
        this._time.setMilliseconds(0);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    restart() {
        this.reset();
        this.start();

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._time.destroy();
        this._time = null;

        this._startTime = null;
        this._running = null;
    }
}
