/**
 * @class Interval
 */
export default class Interval {

    /**
     * @constructs Interval
     * @param {Number} [min=0]
     * @param {Number} [max=min]
     */
    constructor(min = 0, max = min) {

        /**
         * @public
         * @member {Number}
         */
        this._min = min;

        /**
         * @public
         * @member {Number}
         */
        this._max = max;
    }

    /**
     * @public
     * @member {Number}
     */
    get min() {
        return this._min;
    }

    set min(min) {
        this._min = min;
    }

    /**
     * @public
     * @member {Number}
     */
    get max() {
        return this._y;
    }

    set max(max) {
        this._max = max;
    }

    /**
     * @public
     * @chainable
     * @param {Number} min
     * @param {Number} max
     * @returns {Interval}
     */
    set(min, max) {
        this.min = min;
        this.max = max;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Interval} interval
     * @returns {Interval}
     */
    copy(interval) {
        return this.set(interval.min, interval.max);
    }

    /**
     * @public
     * @returns {Interval}
     */
    clone() {
        return new Interval(this.min, this.max);
    }

    /**
     * @public
     * @param {Interval} interval
     * @returns {Boolean}
     */
    contains(interval) {
        return interval.min > this._min && interval.max < this._max;
    }

    /**
     * @public
     * @param {Number} value
     * @returns {Boolean}
     */
    includes(value) {
        return value <= this._max && value >= this._min;
    }

    /**
     * @public
     * @param {Interval} interval
     * @returns {Boolean}
     */
    overlaps(interval) {
        return !(this._min > interval.max || interval.min > this._max);
    }

    /**
     * @public
     * @param {Interval} interval
     * @returns {Number}
     */
    getOverlap(interval) {
        if (!this.overlaps(interval)) {
            return 0;
        }

        return Math.min(this._max, interval.max) - Math.max(this._min, interval.min);
    }

    /**
     * @public
     */
    destroy() {
        this._min = null;
        this._max = null;
    }
}
