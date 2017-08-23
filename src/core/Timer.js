import Clock from './Clock';
import Time from './Time';

/**
 * @class Timer
 * @extends {Exo.Clock}
 * @memberof Exo
 */
export default class Timer extends Clock {

    /**
     * @constructor
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
     * @param {Number} factor
     * @returns {Exo.Timer}
     */
    reset(timeLimit, factor) {
        this._limit = timeLimit * (factor || 1);
        this._timeBuffer = 0;
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} timeLimit
     * @param {Number} factor
     * @returns {Exo.Timer}
     */
    restart(timeLimit, factor) {
        return this.reset(timeLimit, factor).start();
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
        return this.getRemainingMilliseconds() / Time.Seconds;
    }

    /**
     * @public
     * @returns {Number}
     */
    getRemainingMinutes() {
        return this.getRemainingMilliseconds() / Time.Minutes;
    }

    /**
     * @public
     * @returns {Exo.Time}
     */
    getRemainingTime() {
        return this._time.setMilliseconds(this.getRemainingMilliseconds());
    }
}
