import Time from './Time';

/**
 * @class Clock
 * @memberof Exo
 */
export default class Clock {

    /**
     * @constructor
     * @param {Boolean} [autoStart=false]
     */
    constructor(autoStart) {

        /**
         * @private
         * @member {Number}
         */
        this._startTime = 0;

        /**
         * @private
         * @member {Number}
         */
        this._timeBuffer = 0;

        /**
         * @private
         * @member {Boolean}
         */
        this._isRunning = false;

        /**
         * @private
         * @member {Exo.Time}
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
    get isRunning() {
        return this._isRunning;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Clock}
     */
    start() {
        if (this._isRunning) {
            return this;
        }

        this._startTime = Date.now();
        this._isRunning = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Clock}
     */
    stop() {
        if (!this._isRunning) {
            return this;
        }

        this._timeBuffer += (Date.now() - this._startTime);
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Clock}
     */
    reset() {
        this._timeBuffer = 0;
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Exo.Clock}
     */
    restart() {
        return this.reset().start();
    }

    /**
     * @public
     * @returns {Number}
     */
    getElapsedMilliseconds() {
        if (!this._isRunning) {
            return this._timeBuffer;
        }

        return this._timeBuffer + (Date.now() - this._startTime);
    }

    /**
     * @public
     * @returns {Number}
     */
    getElapsedSeconds() {
        return this.getElapsedMilliseconds() / Time.Seconds;
    }

    /**
     * @public
     * @returns {Number}
     */
    getElapsedMinutes() {
        return this.getElapsedMilliseconds() / Time.Minutes;
    }

    /**
     * @public
     * @returns {Exo.Time}
     */
    getElapsedTime() {
        return this._time.setMilliseconds(this.getElapsedMilliseconds());
    }
}
