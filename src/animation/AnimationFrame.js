/**
 * @class AnimationFrame
 */
export default class AnimationFrame {

    /**
     * @constructor
     * @param {Number} duration
     * @param {Rectangle} rectangle
     * @param {Vector} [origin=null]
     */
    constructor(duration, rectangle, origin = null) {

        /**
         * @private
         * @member {Number}
         */
        this._duration = duration;

        /**
         * @private
         * @member {Rectangle}
         */
        this._rectangle = rectangle.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._origin = origin;

        /**
         * @private
         * @member {Boolean}
         */
        this._applyOrigin = !!origin;
    }

    /**
     * @public
     * @member {Number}
     */
    get duration() {
        return this._duration;
    }

    set duration(value) {
        this._duration = value;
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get rectangle() {
        return this._rectangle;
    }

    set rectangle(value) {
        this._rectangle.copy(value);
    }

    /**
     * @public
     * @member {Vector}
     */
    get origin() {
        return this._origin;
    }

    set origin(value) {
        if (!value) {
            this._origin = null;
            this._applyOrigin = false;

            return;
        }

        if (this._origin) {
            this._origin.copy(value);
        } else {
            this._origin = value.clone();
        }
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get applyOrigin() {
        return this._applyOrigin;
    }
}
