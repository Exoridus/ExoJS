import Vector from '../math/Vector';
import Interval from '../math/Interval';
import Polygon from '../math/Polygon';
import { VORONOI_REGION } from '../const/math';
import { getVoronoiRegion } from '../utils/math';

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
     * @param {*} shapeA
     * @param {*} shapeB
     * @returns {Boolean}
     */
    static intersectionSAT(shapeA, shapeB) {
        const normalsA = shapeA.getNormals(),
            normalsB = shapeB.getNormals(),
            lenA = normalsA.length,
            lenB = normalsB.length,
            projA = new Interval(),
            projB = new Interval();

        for (let i = 0; i < lenA; i++) {
            const normal = normalsA[i];

            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return false;
            }
        }

        for (let i = 0; i < lenB; i++) {
            const normal = normalsB[i];

            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @public
     * @static
     * @param {*} shapeA
     * @param {*} shapeB
     * @returns {?Collision}
     */
    static collisionSAT(shapeA, shapeB) {
        const normalsA = shapeA.getNormals(),
            normalsB = shapeB.getNormals(),
            lenA = normalsA.length,
            lenB = normalsB.length,
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
            const normal = normalsA[i];

            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            overlap = projA.getOverlap(projB);
            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            if (containsA || containsB) {
                overlap += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (overlap < distance) {
                distance = overlap;
                separation.copy(normal);
            }
        }

        for (let i = 0; i < lenB; i++) {
            const normal = normalsB[i];

            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            overlap = projA.getOverlap(projB);
            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            if (containsA || containsB) {
                overlap += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (overlap < distance) {
                distance = overlap;
                separation.copy(normal);
            }
        }

        return new Collision({
            shapeA,
            shapeA,
            distance,
            separation,
            shapeAInB,
            shapeBInA,
        });
    }

    /**
     * @public
     * @static
     * @param {Rectangle} rectA
     * @param {Rectangle} rectB
     * @returns {Boolean}
     */
    static intersectionRectRect(rectA, rectB) {
        if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
            return false;
        }

        if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
            return false;
        }

        return true;
    }

    /**
     * @public
     * @static
     * @param {Circle} circleA
     * @param {Circle} circleB
     * @returns {Boolean}
     */
    static intersectionCircleCircle(circleA, circleB) {
        return circleA.position.distanceTo(circleB.x, circleB.y) <= (circleA.radius + circleB.radius);
    }

    /**
     * @public
     * @static
     * @param {Circle} circle
     * @param {Rectangle} rect
     * @returns {Boolean}
     */
    static intersectionCircleRect(circle, rect) {
        const centerWidth = rect.width / 2,
            centerHeight = rect.height / 2,
            radius = circle.radius,
            distanceX = Math.abs(circle.x - rect.x),
            distanceY = Math.abs(circle.y - rect.y);

        if (distanceX > (centerWidth + radius)) {
            return false;
        }

        if (distanceY > (centerHeight + radius)) {
            return false;
        }

        if (distanceX <= centerWidth) {
            return true;
        }

        if (distanceY <= centerHeight) {
            return true;
        }

        return circle.position.distanceTo(rect.x - centerWidth, rect.y - centerHeight) <= radius;
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygon
     * @param {Circle} circle
     * @returns {Boolean}
     */
    static intersectionPolyCircle(polygon, circle) {
        const points = polygon.points,
            x = (circle.x - polygon.x),
            y = (circle.y - polygon.y),
            positionA = new Vector(),
            positionB = new Vector(),
            edgeA = new Vector(),
            edgeB = new Vector(),
            len = points.length;

        for (let i = 0; i < len; i++) {
            const pointA = points[i],
                pointB = points[(i + 1) % len],
                region = getVoronoiRegion(
                    edgeA.set(pointB.x - pointA.x, pointB.y - pointA.y),
                    positionA.set(x - pointA.x, y - pointA.y)
                );

            if (region === VORONOI_REGION.LEFT) {
                const prev = points[(i === 0 ? len - 1 : i - 1)];

                edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
                positionB.set(x - prev.x, y - prev.y);

                if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT) && (positionA.len > circle.radius)) {
                    return false;
                }
            } else if (region === VORONOI_REGION.RIGHT) {
                const next = points[(i + 2) % len]; // pointB ?

                edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
                positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

                if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT && (positionB.len > circle.radius)) {
                    return false;
                }
            } else {
                const normal = edgeA.perp().normalize(),
                    distance = positionA.dot(normal.x, normal.y);

                if (distance > 0 && (Math.abs(distance) > circle.radius)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @public
     * @static
     * @param {Rectangle} rectA
     * @param {Rectangle} rectB
     * @returns {?Collision}
     */
    static collisionRectRect(rectA, rectB) {
        if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
            return null;
        }

        if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
            return null;
        }

        return new Collision({
            shapeA: rectA,
            shapeB: rectB,
            distance: 0, // todo
            separation: Vector.Empty, // todo
            shapeAInB: rectB.containsRect(rectA),
            shapeBInA: rectA.containsRect(rectB),
        });
    }

    /**
     * @public
     * @static
     * @param {Circle} circleA
     * @param {Circle} circleB
     * @returns {?Collision}
     */
    static collisionCircleCircle(circleA, circleB) {
        const distance = circleA.position.distanceTo(circleB.x, circleB.y),
            radii = circleA.radius + circleB.radius;

        return (distance > radii) ? null : new Collision({
            shapeA: circleA,
            shapeB: circleB,
            distance: distance,
            separation: new Vector(circleB.x - circleA.x, circleB.y - circleA.y).normalize().scale(radii - distance),
            shapeAInB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
            shapeBInA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        });
    }

    /**
     * @public
     * @static
     * @param {Circle} circle
     * @param {Rectangle} rect
     * @param {Boolean} [swap=false]
     * @returns {?Collision}
     */
    static collisionCircleRect(circle, rect, swap = false) {
        const centerWidth = rect.width / 2,
            centerHeight = rect.height / 2,
            distance = circle.position.distanceTo(rect.x - centerWidth, rect.y - centerHeight),
            containsA = (circle.radius <= Math.min(centerWidth, centerHeight)) && (distance <= (Math.min(centerWidth, centerHeight) - circle.radius)),
            containsB = (Math.max(centerWidth, centerHeight) <= circle.radius) && (distance <= (circle.radius - Math.max(centerWidth, centerHeight)));

        return (distance <= circle.radius) ? new Collision({
            shapeA: swap ? rect : circle,
            shapeB: swap ? circle : rect,
            distance: distance,
            separation: Vector.Empty, // todo
            shapeAInB: swap ? containsB : containsA,
            shapeBInA: swap ? containsA : containsB,
        }) : null;
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygon
     * @param {Circle} circle
     * @returns {?Collision}
     */
    static collisionPolyCircle(polygon, circle, swap = false) {
        const points = polygon.points,
            x = (circle.x - polygon.x),
            y = (circle.y - polygon.y),
            radius = circle.radius,
            positionA = new Vector(),
            positionB = new Vector(),
            edgeA = new Vector(),
            edgeB = new Vector(),
            len = points.length,
            overlapN = new Vector();

        let containsA = true,
            containsB = true,
            overlap = 0;

        for (let i = 0; i < len; i++) {
            const pointA = points[i],
                pointB = points[(i + 1) % len],
                region = getVoronoiRegion(
                    edgeA.set(pointB.x - pointA.x, pointB.y - pointA.y),
                    positionA.set(x - pointA.x, y - pointA.y)
                );

            if (positionA.len > radius) {
                containsA = false;
            }

            if (region === VORONOI_REGION.LEFT) {
                const prev = points[(i === 0 ? len - 1 : i - 1)];

                edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
                positionB.set(x - prev.x, y - prev.y);

                if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT)) {
                    const distance = positionA.len;

                    if (distance > radius) {
                        return null;
                    }

                    if (Math.abs(radius - distance) < Math.abs(overlap)) {
                        overlap = radius - distance;
                        overlapN.copy(positionA).normalize();
                    }

                    containsB = false;
                }
            } else if (region === VORONOI_REGION.RIGHT) {
                const next = points[(i + 2) % len]; // pointB ?

                edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
                positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

                if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT) {
                    const distance = positionB.len;

                    if (distance > radius) {
                        return null;
                    }

                    if (Math.abs(radius - distance) < Math.abs(overlap)) {
                        overlap = radius - distance;
                        overlapN.copy(positionB).normalize();
                    }

                    containsB = false;
                }
            } else {
                const normal = edgeA.perp().normalize(),
                    distance = positionA.dot(normal.x, normal.y);

                if (distance > 0 && (Math.abs(distance) > radius)) {
                    return null;
                }

                if (distance >= 0 || (radius - distance) < (2 * radius)) {
                    containsB = false;
                }

                if (Math.abs(radius - distance) < Math.abs(overlap)) {
                    overlap = radius - distance;
                    overlapN.copy(normal);
                }
            }
        }

        return new Collision({
            shapeA: swap ? circle : polygon,
            shapeB: swap ? polygon : circle,
            distance: 0, // todo
            separation: overlapN.scale(overlap),
            shapeAInB: swap ? containsB : containsA,
            shapeBInA: swap ? containsA : containsB,
        });
    }
}
