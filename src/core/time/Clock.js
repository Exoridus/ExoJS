import { TIME } from '../../const';
import Time from './Time';

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

        return this._timeBuffer + (Date.now() - this._startTime);
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
            this._startTime = Date.now();
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
            this._timeBuffer += (Date.now() - this._startTime);
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
