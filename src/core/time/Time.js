/**
 * @class Time
 */
export default class Time {

    /**
     * @constructor
     * @param {Number} [time=0]
     * @param {Number} [factor=Time.Milliseconds]
     */
    constructor(time = 0, factor = Time.Milliseconds) {

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
        return this._milliseconds / Time.Seconds;
    }

    set seconds(seconds) {
        this._milliseconds = seconds * Time.Seconds;
    }

    /**
     * @public
     * @member {Number}
     */
    get minutes() {
        return this._milliseconds / Time.Minutes;
    }

    set minutes(minutes) {
        this._milliseconds = minutes * Time.Minutes;
    }

    /**
     * @public
     * @member {Number}
     */
    get hours() {
        return this._milliseconds / Time.Hours;
    }

    set hours(hours) {
        this._milliseconds = hours * Time.Hours;
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
     * @param {Time} time
     * @returns {Boolean}
     */
    equals(time) {
        return this._milliseconds === time.milliseconds;
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
 * @readonly
 * @member {Number}
 */
Time.Milliseconds = 1;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Seconds = 1000;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Minutes = 60000;

/**
 * @public
 * @static
 * @constant
 * @readonly
 * @member {Number}
 */
Time.Hours = 3600000;
