import Time from './Time';
import { TIME } from '../../const';

/**
 * @class Clock
 */
export default class Clock {

    /**
     * @constructor
     * @param {Boolean} [autoStart=false]
     */
    constructor(autoStart = false) {

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
    get isRunning() {
        return this._isRunning;
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
     * @chainable
     * @returns {Clock}
     */
    start() {
        if (!this._isRunning) {
            this._startTime = Date.now();
            this._isRunning = true;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    stop() {
        if (this._isRunning) {
            this._timeBuffer += (Date.now() - this._startTime);
            this._isRunning = false;
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
        this._isRunning = false;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Clock}
     */
    restart() {
        return this.reset()
            .start();
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
        return this.getElapsedMilliseconds() / TIME.SECONDS;
    }

    /**
     * @public
     * @returns {Number}
     */
    getElapsedMinutes() {
        return this.getElapsedMilliseconds() / TIME.MINUTES;
    }

    /**
     * @public
     * @returns {Time}
     */
    getElapsedTime() {
        return this._time.setMilliseconds(this.getElapsedMilliseconds());
    }

    /**
     * @public
     */
    destroy() {
        this._startTime = null;
        this._timeBuffer = null;
        this._isRunning = null;

        this._time.destroy();
        this._time = null;
    }
}
