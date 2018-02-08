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
     * @param {Number} fromValue
     * @param {Number} toValue
     * @param {Number} ratio
     * @returns {Number}
     */
    lerp = (startValue, endValue, ratio) => (
        ((1 - ratio) * startValue) + (ratio * endValue)
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
     * @param {Number} x1
     * @param {Number} x2
     * @param {Number} y1
     * @param {Number} y2
     * @returns {Number}
     */
    getDistance = (x1, y1, x2, y2) => {
        const offsetX = x1 - x2,
            offsetY = y1 - y2;

        return Math.sqrt((offsetX * offsetX) + (offsetY * offsetY));
    },

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
     * @param {Number} [len=20]
     * @return {Number[]}
     */
    bezierCurveTo = (fromX, fromY, cpX1, cpY1, cpX2, cpY2, toX, toY, path = [], len = 20) => {
        path.push(fromX, fromY);

        for (let i = 1, j = 0, dt1 = 0, dt2 = 0, dt3 = 0, t2 = 0, t3 = 0; i <= len; i++) {
            j = i / len;

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
     * @param {Number} fromX
     * @param {Number} fromY
     * @param {Number} cpX
     * @param {Number} cpY
     * @param {Number} toX
     * @param {Number} toY
     * @param {Number[]} [path=[]]
     * @param {Number} [len=20]
     * @return {Number[]}
     */
    quadraticCurveTo = (fromX, fromY, cpX, cpY, toX, toY, path = [], len = 20) => {
        for (let i = 0; i <= len; i++) {
            const ratio = i / len;

            path.push(
                lerp(lerp(fromX, cpX, ratio), lerp(cpX, toX, ratio), ratio),
                lerp(lerp(fromY, cpY, ratio), lerp(cpY, toY, ratio), ratio)
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
        var product = point.dot(line.x, line.y);

        if (product < 0) {
            return VORONOI_REGION.LEFT;
        } else if (product > line.lengthSq) {
            return VORONOI_REGION.RIGHT;
        } else {
            return VORONOI_REGION.MIDDLE;
        }
    };

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
    getDistance,
    bezierCurveTo,
    quadraticCurveTo,
    getVoronoiRegion,
};
