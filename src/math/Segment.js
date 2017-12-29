import Vector from './Vector';

/**
 * @class Segment
 */
export default class Segment {

    /**
     * @constructor
     * @param {Number} startX
     * @param {Number} startY
     * @param {Number} endX
     * @param {Number} endY
     */
    constructor(startX, startY, endX, endY) {

        /**
         * @private
         * @member {Vector}
         */
        this._startPoint = new Vector(startX, startY);

        /**
         * @private
         * @member {Vector}
         */
        this._endPoint = new Vector(endX, endY);
    }

    /**
     * @public
     * @member {Vector}
     */
    get startPoint() {
        return this._startPoint;
    }

    set startPoint(startPoint) {
        this._startPoint.copy(startPoint);
    }

    /**
     * @public
     * @member {Number}
     */
    get startX() {
        return this._startPoint.x;
    }

    set startX(x) {
        this._startPoint.x = x;
    }

    /**
     * @public
     * @member {Number}
     */
    get startY() {
        return this._startPoint.y;
    }

    set startY(y) {
        this._startPoint.y = y;
    }

    /**
     * @public
     * @member {Vector}
     */
    get endPoint() {
        return this._endPoint;
    }

    set endPoint(endPoint) {
        this._endPoint.copy(endPoint);
    }

    /**
     * @public
     * @member {Number}
     */
    get endX() {
        return this._endPoint.x;
    }

    set endX(x) {
        this._endPoint.x = x;
    }

    /**
     * @public
     * @member {Number}
     */
    get endY() {
        return this._endPoint.y;
    }

    set endY(y) {
        this._endPoint.y = y;
    }

    /**
     * @public
     * @chainable
     * @param {Number} startX
     * @param {Number} startY
     * @param {Number} endX
     * @param {Number} endY
     * @returns {Segment}
     */
    set(startX, startY, endX, endY) {
        this._startPoint.set(startX, startY);
        this._endPoint.set(endX, endY);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Segment} segment
     * @returns {Segment}
     */
    copy(segment) {
        this._startPoint.copy(segment.startPoint);
        this._endPoint.copy(segment.endPoint);

        return this;
    }

    /**
     * @public
     * @returns {Segment}
     */
    clone() {
        return new Segment(this.startX, this.startY, this.endX, this.endY);
    }

    /**
     * @public
     * @param {Segment|Object} segment
     * @param {Number} [segment.startX]
     * @param {Number} [segment.startY]
     * @param {Number} [segment.endX]
     * @param {Number} [segment.endY]
     * @returns {Boolean}
     */
    equals({ startX, startY, endX, endY } = {}) {
        return (startX === undefined || this.startX === startX)
            && (startY === undefined || this.startY === startY)
            && (endX === undefined || this.endX === endX)
            && (endY === undefined || this.endY === endY);
    }

    /**
     * @public
     */
    destroy() {
        this._startPoint.destroy();
        this._startPoint = null;

        this._endPoint.destroy();
        this._endPoint = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @member {Segment}
 */
Segment.Empty = new Segment(0, 0, 0, 0);

/**
 * @public
 * @static
 * @constant
 * @member {Segment}
 */
Segment.Temp = new Segment(0, 0, 0, 0);
