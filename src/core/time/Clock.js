import { TIME } from '../../const/core';
import Time from './Time';

/**
 * @inner
 */
const timing = (performance || Date);

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
         * @member {Number}
         */
        this._timeBuffer = 0;

        /**
         * @private
         * @member {Boolean}
         */
        this._running = false;

        /**
         * @private
         * @member {Time}
         */
        this._time = new Time();

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
     * @member {Number}
     */
    get elapsedTime() {
        return this._time.setMilliseconds(this.elapsedMilliseconds);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedMilliseconds() {
        if (!this._running) {
            return this._timeBuffer;
        }

        return this._timeBuffer + (timing.now() - this._startTime);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedSeconds() {
        return this.elapsedMilliseconds / TIME.SECONDS;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedMinutes() {
        return this.elapsedMilliseconds / TIME.MINUTES;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get elapsedHours() {
        return this.elapsedMilliseconds / TIME.HOURS;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    start() {
        if (!this._running) {
            this._startTime = timing.now();
            this._running = true;
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
            this._timeBuffer += (timing.now() - this._startTime);
            this._running = false;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    reset() {
        this._timeBuffer = 0;
        this._running = false;

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
        this._startTime = null;
        this._timeBuffer = null;
        this._running = null;

        this._time.destroy();
        this._time = null;
    }
}
