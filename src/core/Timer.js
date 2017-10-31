import { TIME } from '../const';
import Clock from './Clock';
import Time from './Time';

/**
 * @class Timer
 * @extends {Clock}
 */
export default class Timer extends Clock {

    /**
     * @constructs Timer
     * @param {Boolean} autoStart
     * @param {Number} timeLimit
     * @param {Number} factor
     */
    constructor(autoStart, timeLimit, factor) {
        super(false);

        /**
         * @private
         * @member {Number}
         */
        this._limit = 0;

        if (autoStart) {
            this.restart(timeLimit, factor);
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get isRunning() {
        return this._isRunning && !this.isExpired;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get isExpired() {
        return this.getElapsedMilliseconds() >= this._limit;
    }

    /**
     * @public
     * @chainable
     * @param {Number} timeLimit
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */
    reset(timeLimit, factor = TIME.MILLISECONDS) {
        this._limit = timeLimit * factor;
        this._timeBuffer = 0;
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} timeLimit
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */
    restart(timeLimit, factor = TIME.MILLISECONDS) {
        return this
            .reset(timeLimit, factor)
            .start();
    }

    /**
     * @public
     * @returns {Number}
     */
    getRemainingMilliseconds() {
        return Math.max(0, this._limit - this.getElapsedMilliseconds());
    }

    /**
     * @public
     * @returns {Number}
     */
    getRemainingSeconds() {
        return this.getRemainingMilliseconds() / TIME.SECONDS;
    }

    /**
     * @public
     * @returns {Number}
     */
    getRemainingMinutes() {
        return this.getRemainingMilliseconds() / TIME.MINUTES;
    }

    /**
     * @public
     * @returns {Time}
     */
    getRemainingTime() {
        return this.time.setMilliseconds(this.getRemainingMilliseconds());
    }
}
