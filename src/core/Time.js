import { TIME } from '../const';

/**
 * @class Time
 */
export default class Time {

    /**
     * @constructor
     * @param {Number} [time=0]
     * @param {Number} [factor=TIME.MILLISECONDS]
     */
    constructor(time = 0, factor = TIME.MILLISECONDS) {

        /**
         * @private
         * @member {Number}
         */
        this._milliseconds = time * factor;
    }

    /**
     * @public
     * @member {Number}
     */
    get milliseconds() {
        return this._milliseconds;
    }

    set milliseconds(milliseconds) {
        this._milliseconds = milliseconds;
    }

    /**
     * @public
     * @member {Number}
     */
    get seconds() {
        return this._milliseconds / TIME.SECONDS;
    }

    set seconds(seconds) {
        this._milliseconds = seconds * TIME.SECONDS;
    }

    /**
     * @public
     * @member {Number}
     */
    get minutes() {
        return this._milliseconds / TIME.MINUTES;
    }

    set minutes(minutes) {
        this._milliseconds = minutes * TIME.MINUTES;
    }

    /**
     * @public
     * @member {Number}
     */
    get hours() {
        return this._milliseconds / TIME.HOURS;
    }

    set hours(hours) {
        this._milliseconds = hours * TIME.HOURS;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [time=0]
     * @param {Number} [factor=TIME.MILLISECONDS]
     * @returns {Time}
     */
    set(time = 0, factor = TIME.MILLISECONDS) {
        this._milliseconds = time * factor;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} milliseconds
     * @returns {Time}
     */
    setMilliseconds(milliseconds) {
        this.milliseconds = milliseconds;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} seconds
     * @returns {Time}
     */
    setSeconds(seconds) {
        this.seconds = seconds;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} minutes
     * @returns {Time}
     */
    setMinutes(minutes) {
        this.minutes = minutes;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} hours
     * @returns {Time}
     */
    setHours(hours) {
        this.hours = hours;

        return this;
    }

    /**
     * @public
     * @param {Time|Object} time
     * @param {Number} [time.milliseconds]
     * @param {Number} [time.seconds]
     * @param {Number} [time.minutes]
     * @param {Number} [time.hours]
     * @returns {Boolean}
     */
    equals({ milliseconds, seconds, minutes, hours } = {}) {
        return (milliseconds === undefined || this.milliseconds === milliseconds)
            && (seconds === undefined || this.seconds === seconds)
            && (minutes === undefined || this.minutes === minutes)
            && (hours === undefined || this.hours === hours);
    }

    /**
     * @public
     * @param {Time} time
     * @returns {Boolean}
     */
    greaterThan(time) {
        return this._milliseconds > time.milliseconds;
    }

    /**
     * @public
     * @param {Time} time
     * @returns {Boolean}
     */
    lessThan(time) {
        return this._milliseconds < time.milliseconds;
    }

    /**
     * @public
     * @returns {Time}
     */
    clone() {
        return new Time(this._milliseconds);
    }

    /**
     * @public
     * @chainable
     * @param {Time} time
     * @returns {Time}
     */
    copy(time) {
        this._milliseconds = time.milliseconds;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} time
     * @returns {Time}
     */
    add(time) {
        this._milliseconds += time.milliseconds;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} time
     * @returns {Time}
     */
    subtract(time) {
        this._milliseconds -= time.milliseconds;

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._milliseconds = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @member {Time}
 */
Time.Empty = new Time(0);

/**
 * @public
 * @static
 * @constant
 * @member {Time}
 */
Time.Temp = new Time();
