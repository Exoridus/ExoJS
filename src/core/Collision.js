import Vector from '../types/Vector';
import Interval from '../types/Interval';
import Polygon from '../types/Polygon';
import { VORONOI_REGION } from '../const';
import { getDistance, getVoronoiRegion } from '../utils/math';

/**
 * @class Collision
 */
export default class Collision {

    /**
     * @constructor
     * @param {Object} options
     * @param {Polygon|Circle|Rectangle|SceneNode} options.shapeA
     * @param {Polygon|Circle|Rectangle|SceneNode} options.shapeB
     * @param {Number} options.overlap
     * @param {Boolean} options.shapeAInB
     * @param {Boolean} options.shapeBInA
     * @param {Vector} options.projectionN
     * @param {Vector} options.projectionV
     */
    constructor({ shapeA, shapeB, overlap, shapeAInB, shapeBInA, projectionN, projectionV } = {}) {

        /**
         * @private
         * @member {Polygon|Circle|Rectangle|SceneNode}
         */
        this._shapeA = shapeA;

        /**
         * @private
         * @member {Polygon|Circle|Rectangle|SceneNode}
         */
        this._shapeB = shapeB;

        /**
         * @private
         * @member {Number}
         */
        this._overlap = overlap;

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

        /**
         * @private
         * @member {Vector}
         */
        this._projectionN = projectionN;

        /**
         * @private
         * @member {Vector}
         */
        this._projectionV = projectionV;
    }

    /**
     * @public
     * @readonly
     * @member {Polygon|Circle|Rectangle|SceneNode}
     */
    get shapeA() {
        return this._shapeA;
    }

    /**
     * @public
     * @readonly
     * @member {Polygon|Circle|Rectangle|SceneNode}
     */
    get shapeB() {
        return this._shapeB;
    }

    /**
     * @public
     * @readonly
     * @member {Number}
     */
    get overlap() {
        return this._overlap;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get shapeAInB() {
        return this._shapeAInB;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get shapeBInA() {
        return this._shapeBInA;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get projectionN() {
        return this._projectionN;
    }

    /**
     * @public
     * @readonly
     * @member {Vector}
     */
    get projectionV() {
        return this._projectionV;
    }

    /**
     * @public
     */
    destroy() {
        this._projectionN.destroy();
        this._projectionN = null;

        this._projectionV.destroy();
        this._projectionV = null;

        this._shapeA = null;
        this._shapeB = null;
        this._overlap = null;
        this._shapeAInB = null;
        this._shapeBInA = null;
    }

    /**
     * @public
     * @static
     * @param {Polygon|Circle|Rectangle|SceneNode} shapeA
     * @param {Polygon|Circle|Rectangle|SceneNode} shapeB
     * @returns {Boolean}
     */
    static intersectionSAT(shapeA, shapeB) {
        const normalsA = shapeA.getNormals(),
            normalsB = shapeB.getNormals(),
            projA = new Interval(),
            projB = new Interval();

        for (const normal of normalsA) {
            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return false;
            }
        }

        for (const normal of normalsB) {
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
     * @param {Polygon|Circle|Rectangle|SceneNode} shapeA
     * @param {Polygon|Circle|Rectangle|SceneNode} shapeB
     * @returns {?Collision}
     */
    static collisionSAT(shapeA, shapeB) {
        const projection = new Vector(),
            normalsA = shapeA.getNormals(),
            normalsB = shapeB.getNormals(),
            projA = new Interval(),
            projB = new Interval();

        let overlap = Infinity,
            shapeAInB = true,
            shapeBInA = true,
            containsA,
            containsB,
            distance;

        for (const normal of normalsA) {
            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            distance = projA.getOverlap(projB);
            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            if (containsA || containsB) {
                distance += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (distance < overlap) {
                overlap = distance;
                projection.copy(normal);
            }
        }

        for (const normal of normalsB) {
            shapeA.project(normal, projA);
            shapeB.project(normal, projB);

            if (!projA.overlaps(projB)) {
                return null;
            }

            distance = projA.getOverlap(projB);
            containsA = projB.contains(projA);
            containsB = projA.contains(projB);

            if (!containsA && shapeAInB) {
                shapeAInB = false;
            }

            if (!containsB && shapeBInA) {
                shapeBInA = false;
            }

            if (containsA || containsB) {
                distance += Math.min(
                    Math.abs(projA.min - projB.min),
                    Math.abs(projA.max - projB.max)
                );
            }

            if (distance < overlap) {
                overlap = distance;
                projection.copy(normal);
            }
        }

        return new Collision({
            shapeA: shapeA,
            shapeB: shapeB,
            overlap: overlap,
            shapeAInB: shapeAInB,
            shapeBInA: shapeBInA,
            projectionN: projection,
            projectionV: projection.clone().multiply(overlap, overlap),
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
        return getDistance(circleA.x, circleA.y, circleB.x, circleB.y) <= (circleA.radius + circleB.radius);
    }

    /**
     * @public
     * @static
     * @param {Circle} circle
     * @param {Rectangle} rect
     * @returns {Boolean}
     */
    static intersectionCircleRect(circle, rect) {
        const { x, y, radius } = circle,
            centerWidth = rect.width / 2,
            centerHeight = rect.height / 2,
            distanceX = Math.abs(x - rect.x),
            distanceY = Math.abs(y - rect.y);

        if ((distanceX > (centerWidth + radius)) || (distanceY > (centerHeight + radius))) {
            return false;
        }

        if ((distanceX <= centerWidth) || (distanceY <= centerHeight)) {
            return true;
        }

        return getDistance(x, y, rect.x - centerWidth, rect.y - centerHeight) <= radius;
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

                if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT) && (positionA.length > circle.radius)) {
                    return false;
                }
            } else if (region === VORONOI_REGION.RIGHT) {
                const next = points[(i + 2) % len]; // pointB ?

                edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
                positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

                if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT && (positionB.length > circle.radius)) {
                    return false;
                }
            } else {
                const normal = edgeA.rperp().normalize(),
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
            overlap: 0, // todo
            shapeAInB: rectB.containsRect(rectA),
            shapeBInA: rectA.containsRect(rectB),
            projectionN: new Vector(), // todo
            projectionV: new Vector(), // todo
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
        const difference = new Vector(circleB.x - circleA.x, circleB.y - circleA.y),
            distance = difference.length,
            overlap = (circleA.radius + circleB.radius) - distance;

        if (overlap < 0) {
            return null;
        }

        return new Collision({
            shapeA: circleA,
            shapeB: circleB,
            overlap: overlap,
            shapeAInB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
            shapeBInA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
            projectionN: difference.normalize(),
            projectionV: difference.multiply(overlap),
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
        const radius = circle.radius,
            centerWidth = rect.width / 2,
            centerHeight = rect.height / 2,
            distance = getDistance(circle.x, circle.y, rect.x - centerWidth, rect.y - centerHeight),
            containsA = (radius <= Math.min(centerWidth, centerHeight)) && (distance <= (Math.min(centerWidth, centerHeight) - radius)),
            containsB = (Math.max(centerWidth, centerHeight) <= radius) && (distance <= (radius - Math.max(centerWidth, centerHeight)));

        if (distance > circle.radius) {
            return null;
        }

        return new Collision({
            shapeA: swap ? rect : circle,
            shapeB: swap ? circle : rect,
            overlap: radius - distance,
            shapeAInB: swap ? containsB : containsA,
            shapeBInA: swap ? containsA : containsB,
            projectionN: new Vector(), // todo
            projectionV: new Vector(), // todo
        });
    }

    /**
     * @public
     * @static
     * @param {Polygon} polygon
     * @param {Circle} circle
     * @returns {?Collision}
     */
    static collisionPolyCircle(polygon, circle, swap = false) {
        const radius = circle.radius,
            points = polygon.points,
            x = (circle.x - polygon.x),
            y = (circle.y - polygon.y),
            projection = new Vector(),
            positionA = new Vector(),
            positionB = new Vector(),
            edgeA = new Vector(),
            edgeB = new Vector(),
            len = points.length;

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

            if (positionA.length > radius) {
                containsA = false;
            }

            if (region === VORONOI_REGION.LEFT) {
                const prev = points[(i === 0 ? len - 1 : i - 1)];

                edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
                positionB.set(x - prev.x, y - prev.y);

                if ((getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.RIGHT)) {
                    const distance = positionA.length;

                    if (distance > radius) {
                        return null;
                    }

                    if (Math.abs(radius - distance) < Math.abs(overlap)) {
                        overlap = radius - distance;
                        projection.copy(positionA).normalize();
                    }

                    containsB = false;
                }
            } else if (region === VORONOI_REGION.RIGHT) {
                const next = points[(i + 2) % len]; // pointB ?

                edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
                positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

                if (getVoronoiRegion(edgeB, positionB) === VORONOI_REGION.LEFT) {
                    const distance = positionB.length;

                    if (distance > radius) {
                        return null;
                    }

                    if (Math.abs(radius - distance) < Math.abs(overlap)) {
                        overlap = radius - distance;
                        projection.copy(positionB).normalize();
                    }

                    containsB = false;
                }
            } else {
                const normal = edgeA.rperp().normalize(),
                    distance = positionA.dot(normal.x, normal.y);

                if (distance > 0 && (Math.abs(distance) > radius)) {
                    return null;
                }

                if (distance >= 0 || (radius - distance) < (2 * radius)) {
                    containsB = false;
                }

                if (Math.abs(radius - distance) < Math.abs(overlap)) {
                    overlap = radius - distance;
                    projection.copy(normal);
                }
            }
        }

        return new Collision({
            shapeA: swap ? circle : polygon,
            shapeB: swap ? polygon : circle,
            overlap: overlap,
            shapeAInB: swap ? containsB : containsA,
            shapeBInA: swap ? containsA : containsB,
            projectionN: projection,
            projectionV: projection.multiply(overlap),
        });
    }
}
