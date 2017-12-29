import { RAD_PER_DEG, DEG_PER_RAD, VORONOI_REGION } from '../const/math';

const

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} degree
     * @returns {Number}
     */
    degreesToRadians = (degree) => degree * RAD_PER_DEG,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} radian
     * @returns {Number}
     */
    radiansToDegrees = (radian) => radian * DEG_PER_RAD,

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Number}
     */
    clamp = (value, min, max) => Math.min(max, Math.max(min, value)),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Number}
     */
    sign = (value) => (
        value && (value < 0 ? -1 : 1)
    ),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @returns {Boolean}
     */
    isPowerOfTwo = (value) => (
        (value !== 0) && ((value & (value - 1)) === 0)
    ),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} value
     * @param {Number} min
     * @param {Number} max
     * @returns {Boolean}
     */
    inRange = (value, min, max) => (
        (value >= Math.min(min, max)) && (value <= Math.max(min, max))
    ),

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} fromX
     * @param {Number} fromY
     * @param {Number} cpX1
     * @param {Number} cpY1
     * @param {Number} cpX2
     * @param {Number} cpY2
     * @param {Number} toX
     * @param {Number} toY
     * @param {Number[]} [path=[]]
     * @return {Number[]}
     */
    bezierCurveTo = (fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY, path = []) => {
        path.push(fromX, fromY);

        for (let i = 1, j = 0, dt1 = 0, dt2 = 0, dt3 = 0, t2 = 0, t3 = 0; i <= 20; i++) {
            j = i / 20;

            dt1 = (1 - j);
            dt2 = dt1 * dt1;
            dt3 = dt2 * dt1;

            t2 = j * j;
            t3 = t2 * j;

            path.push(
                (dt3 * fromX) + (3 * dt2 * j * cpX1) + (3 * dt1 * t2 * cpX2) + (t3 * toX),
                (dt3 * fromY) + (3 * dt2 * j * cpY1) + (3 * dt1 * t2 * cpY2) + (t3 * toY)
            );
        }

        return path;
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Vector} line
     * @param {Vector} point
     * @returns {Number}
     */
    getVoronoiRegion = (line, point) => {
        var dp = point.dot(line.x, line.y);

        if (dp < 0) {
            return VORONOI_REGION.LEFT;
        } else if (dp > line.len2) {
            return VORONOI_REGION.RIGHT;
        } else {
            return VORONOI_REGION.MIDDLE;
        }
    },

    /**
     * @public
     * @constant
     * @type {Function}
     * @param {Number} fromValue
     * @param {Number} toValue
     * @param {Number} ratio
     * @returns {Number}
     */
    lerp = (startValue, endValue, ratio) => ((1 - ratio) * startValue + ratio * endValue);

/**
 * @namespace Exo
 */
export {
    degreesToRadians,
    radiansToDegrees,
    clamp,
    sign,
    lerp,
    isPowerOfTwo,
    inRange,
    bezierCurveTo,
    getVoronoiRegion,
};
