import Vector from './Vector';
import Interval from './Interval';
import Polygon from './Polygon';

/**
 * @class Collision
 */
export default class Collision {

    /**
     * @constructor
     * @param {Object} options
     * @param {*} options.shapeA
     * @param {*} options.shapeB
     * @param {Number} options.distance
     * @param {Vector} options.separation
     * @param {Boolean} options.shapeAInB
     * @param {Boolean} options.shapeBInA
     */
    constructor({ shapeA, shapeB, distance = 0, separation = Vector.Empty, shapeAInB = false, shapeBInA = false } = {}) {

        /**
         * @private
         * @member {*}
         */
        this._shapeA = shapeA;

        /**
         * @private
         * @member {*}
         */
        this._shapeB = shapeB;

        /**
         * @private
         * @member {Number}
         */
        this._distance = distance;

        /**
         * @private
         * @member {Vector}
         */
        this._separation = separation.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._shapeAInB = shapeAInB;

        /**
         * @private
         * @member {Boolean}
         */
        this._shapeBInA = shapeBInA;
    }

    /**
     * @public
     * @member {*}
     */
    get shapeA() {
        return this._shapeA;
    }

    set shapeA(value) {
        this._shapeA = value;
    }

    /**
     * @public
     * @member {*}
     */
    get shapeB() {
        return this._shapeB;
    }

    set shapeB(value) {
        this._shapeB = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get distance() {
        return this._distance;
    }

    set distance(value) {
        this._distance = value;
    }

    /**
     * @public
     * @member {Vector}
     */
    get separation() {
        return this._separation;
    }

    set separation(value) {
        this._separation.copy(value);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get shapeAInB() {
        return this._shapeAInB;
    }

    set shapeAInB(value) {
        this._shapeAInB = value;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get shapeBInA() {
        return this._shapeBInA;
    }

    set shapeBInA(value) {
        this._shapeBInA = value;
    }

    /**
     * @public
     */
    destroy() {
        this._shapeA = null;
        this._shapeB = null;
        this._distance = null;
        this._separation = null;
        this._shapeAInB = null;
        this._shapeBInA = null;
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygonA
     * @param {Polygon} polygonB
     * @returns {?Collision}
     */
    static checkPolygonPolygon(polygonA, polygonB) {
        const axis = Vector.Temp,
            pointsA = polygonA.points,
            pointsB = polygonB.points,
            lenA = pointsA.length,
            lenB = pointsB.length,
            projA = new Interval(),
            projB = new Interval(),
            separation = new Vector();

        let containsA = false,
            containsB = false,
            shapeAInB = true,
            shapeBInA = true,
            distance = Infinity,
            overlap;

        for (let i = 0; i < lenA; i++) {
            const point = pointsA[i],
                nextPoint = pointsA[(i + 1) % lenA];

            axis.copy(nextPoint)
                .subtract(point.x, point.y)
                .perp();

            polygonA.project(axis, projA);
            polygonB.project(axis, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            overlap = projA.getOverlap(projB);

            if (containsA || containsB) {
                overlap += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (overlap < distance) {
                distance = overlap;
                separation.copy(axis);
            }
        }

        for (let i = 0; i < lenB; i++) {
            const point = pointsB[i],
                nextPoint = pointsB[(i + 1) % lenB];

            axis.copy(nextPoint)
                .subtract(point.x, point.y)
                .perp();

            polygonA.project(axis, projA);
            polygonB.project(axis, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            overlap = projA.getOverlap(projB);

            if (containsA || containsB) {
                overlap += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (overlap < distance) {
                distance = overlap;
                separation.copy(axis);
            }
        }

        return new Collision({
            shapeA: polygonA,
            shapeB: polygonB,
            distance,
            separation,
            shapeAInB,
            shapeBInA,
        });
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygon
     * @param {Rectangle} rect
     * @returns {?Collision}
     */
    static checkPolygonRectangle(polygon, rect) {
        return Collision.checkPolygonPolygon(polygon, Polygon.Temp.set(0, 0, [
            new Vector(rect.left, rect.top),
            new Vector(rect.right, rect.top),
            new Vector(rect.left, rect.bottom),
            new Vector(rect.right, rect.bottom),
        ]));
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygon
     * @param {Circle} circle
     * @returns {?Collision}
     */
    static checkPolygonCircle(polygon, circle) {

    }

    /**
     * @public
     * @static
     * @param {Circle} circleA
     * @param {Circle} circleB
     * @returns {?Collision}
     */
    static checkCircleCircle(circleA, circleB) {
        const distance = circleA.position.distanceTo(circleB.x, circleB.y),
            totalRadius = circleA.radius + circleB.radius;

        return (distance > totalRadius) ? null : new Collision({
            shapeA: circleA,
            shapeB: circleB,
            distance: distance,
            separation: circleB.position.clone().subtract(circleA.x, circleA.y).normalize().multiply(totalRadius - distance),
            shapeAInB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
            shapeBInA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        });
    }

    /**
     * @public
     * @static
     * @param {Circle} circle
     * @param {Rectangle} rect
     * @returns {?Collision}
     */
    static checkCircleRectangle(circle, rect) {

    }

    /**
     * @public
     * @static
     * @param {Rectangle} rectA
     * @param {Rectangle} rectB
     * @returns {?Collision}
     */
    static checkRectangleRectangle(rectA, rectB) {
        if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
            return null;
        }

        if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
            return null;
        }

        return new Collision({
            shapeA: rectA,
            shapeB: rectB,
            distance: null,
            separation: null,
            shapeAInB: rectB.containsRect(rectA),
            shapeBInA: rectA.containsRect(rectB),
        });
    }
}
