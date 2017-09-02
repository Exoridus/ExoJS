/**
 * @class Time
 * @memberof Exo
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
     * @chainable
     * @param {Number} value
     * @returns {Exo.Time}
     */
    setMilliseconds(value) {
        this._milliseconds = value;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} value
     * @returns {Exo.Time}
     */
    setSeconds(value) {
        this._milliseconds = value * Time.Seconds;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} value
     * @returns {Exo.Time}
     */
    setMinutes(value) {
        this._milliseconds = value * Time.Minutes;

        return this;
    }

    /**
     * @public
     * @returns {Number}
     */
    asMilliseconds() {
        return this._milliseconds;
    }

    /**
     * @public
     * @returns {Number}
     */
    asSeconds() {
        return this._milliseconds / Time.Seconds;
    }

    /**
     * @public
     * @returns {Number}
     */
    asMinutes() {
        return this._milliseconds / Time.Minutes;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */
    equals(time) {
        return this._milliseconds === time._milliseconds;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */
    greaterThan(time) {
        return this._milliseconds > time._milliseconds;
    }

    /**
     * @public
     * @param {Exo.Time} time
     * @returns {Boolean}
     */
    lessThan(time) {
        return this._milliseconds < time._milliseconds;
    }

    /**
     * @public
     * @returns {Exo.Time}
     */
    clone() {
        return new Time(this._milliseconds);
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */
    copy(time) {
        this._milliseconds = time.asMilliseconds();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */
    add(time) {
        this._milliseconds += time.asMilliseconds();

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Exo.Time} time
     * @returns {Exo.Time}
     */
    subtract(time) {
        this._milliseconds -= time.asMilliseconds();

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._milliseconds = null;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Milliseconds() {
        return 1;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Seconds() {
        return 1000;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Minutes() {
        return 60000;
    }

    /**
     * @public
     * @static
     * @readonly
     * @member {Number}
     */
    static get Hours() {
        return 3600000;
    }
}
