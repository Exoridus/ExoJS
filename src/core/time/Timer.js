import { TIME } from '../../const/core';
import Clock from './Clock';

/**
 * @class Timer
 * @extends Clock
 */
export default class Timer extends Clock {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Number} [options.timeLimit=0]
     * @param {Number} [options.factor=TIME.MILLISECONDS]
     * @param {Boolean} [options.autoStart=false]
     */
    constructor({ limit = 0, factor = TIME.MILLISECONDS, autoStart = false } = {}) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._limit = (limit * factor);

        if (autoStart) {
            this.restart();
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get expired() {
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
}
