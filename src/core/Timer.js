import { TIME } from '../const';
import Clock from './Clock';
import Time from './Time';

/**
 * @class Timer
 * @extends Clock
 */
export default class Timer extends Clock {

    /**
     * @constructor
     * @param {Boolean} autoStart
     * @param {Number} [timeLimit=0]
     * @param {Number} [factor=TIME.MILLISECONDS]
     */
    constructor(autoStart, timeLimit = 0, factor = TIME.MILLISECONDS) {
        super(false);

        /**
         * @private
         * @member {Number}
         */
        this._limit = timeLimit;

        if (autoStart) {
            this.restart(timeLimit, factor);
        }
    }

    /**
     * @override
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
        return this.elapsedMilliseconds >= this._limit;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get remainingMilliseconds() {
        return Math.max(0, this._limit - this.elapsedMilliseconds);
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get remainingSeconds() {
        return this.remainingMilliseconds / TIME.SECONDS;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get remainingMinutes() {
        return this.remainingMilliseconds / TIME.MINUTES;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get remainingHours() {
        return this.remainingMilliseconds / TIME.HOURS;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [timeLimit=this._limit]
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */
    reset(timeLimit = this._limit, factor = TIME.MILLISECONDS) {
        this._limit = (timeLimit * factor);
        this._timeBuffer = 0;
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [timeLimit=this._limit]
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Timer}
     */
    restart(timeLimit = this._limit, factor = TIME.MILLISECONDS) {
        this.reset(timeLimit, factor);
        this.start();

        return this;
    }
}
