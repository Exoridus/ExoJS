import { Vector } from 'math/Vector';
import { Interval } from 'math/Interval';
import { Line } from "math/Line";
import { clamp, getDistance, getVoronoiRegion, inRange, VoronoiRegion } from "utils/math";
import type { Collidable, Collision } from "types/Collision";
import type { Polygon } from 'math/Polygon';
import type { Rectangle } from 'math/Rectangle';
import type { Circle } from 'math/Circle';
import type { Ellipse } from "math/Ellipse";

/**
 * INTERSECTION
 */

const intersectionSAT = (shapeA: Collidable, shapeB: Collidable): boolean => {
    const normalsA = shapeA.getNormals();
    const normalsB = shapeB.getNormals();
    const projectionA = new Interval();
    const projectionB = new Interval();

    for (const normal of normalsA) {
        shapeA.project(normal, projectionA);
        shapeB.project(normal, projectionB);

        if (!projectionA.overlaps(projectionB)) {
            return false;
        }
    }

    for (const normal of normalsB) {
        shapeA.project(normal, projectionA);
        shapeB.project(normal, projectionB);

        if (!projectionA.overlaps(projectionB)) {
            return false;
        }
    }

    return true;
};

const intersectionPointPoint = ({ x: x1, y: y1 }: Vector, { x: x2, y: y2 }: Vector, threshold = 0): boolean => (
    getDistance(x1, y1, x2, y2) <= threshold
);

const intersectionPointLine = ({ x, y }: Vector, { fromX, fromY, toX, toY }: Line, threshold = 0.1): boolean => {
    const d1 = getDistance(x, y, fromX, fromY);
    const d2 = getDistance(x, y, toX, toY);
    const d3 = getDistance(fromX, fromY, toX, toY);

    return (d1 + d2) >= (d3 - threshold)
        && (d1 + d2) <= (d3 + threshold);
};

const intersectionPointRect = ({ x: x1, y: y1 }: Vector, { x: x2, y: y2, width, height }: Rectangle): boolean => (
    inRange(x1, x2, x2 + width) && inRange(y1, y2, y2 + height)
);

const intersectionPointCircle = ({ x: x1, y: y1 }: Vector, { x: x2, y: y2, radius }: Circle): boolean => (
    radius > 0 && getDistance(x1, y1, x2, y2) <= radius
);

const intersectionPointEllipse = ({ x: x1, y: y1 }: Vector, { x: x2, y: y2, rx, ry }: Ellipse): boolean => {
    if (rx <= 0 || ry <= 0) {
        return false;
    }

    const normX = (x1 - x2) / rx;
    const normY = (y1 - y2) / ry;

    return ((normX * normX) + (normY * normY)) <= 1;
};

const intersectionPointPoly = ({ x, y }: Vector, { points }: Polygon): boolean => {
    const len = points.length;

    let inside = false;

    for (let curr = 0, prev = len - 1; curr < len; prev = curr++) {
        const { x: prevX, y: prevY } = points[prev];
        const { x: currX, y: currY } = points[curr];

        if (((currY > y) !== (prevY > y)) && (x < ((prevX - currX) * ((y - currY) / (prevY - currY))) + currX)) {
            inside = !inside;
        }
    }

    return inside;
};

const intersectionLineLine = ({ fromX: x1, fromY: y1, toX: x2, toY: y2 }: Line, { fromX: x3, fromY: y3, toX: x4, toY: y4 }: Line): boolean => {
    const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((x2 - x1) * (y4 - y3) - (x4 - x3) * (y2 - y1));
    const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

    return uA >= 0 && uA <= 1
        && uB >= 0 && uB <= 1;
};

const intersectionLineRect = (line: Line, { x, y, width, height }: Rectangle): boolean => {
    return intersectionLineLine(line, Line.Temp.set(x, y, x, y + height))
        || intersectionLineLine(line, Line.Temp.set(x + width, y, x + width, y + height))
        || intersectionLineLine(line, Line.Temp.set(x, y, x + width, y))
        || intersectionLineLine(line, Line.Temp.set(x, y + height, x + width, y + height));
};

const intersectionLineCircle = (line: Line, circle: Circle): boolean => {
    if (intersectionPointCircle(line.fromPosition, circle) || intersectionPointCircle(line.toPosition, circle)) {
        return true;
    }

    const { fromX: x1, fromY: y1, toX: x2, toY: y2 } = line;
    const { x: cx, y: cy, radius } = circle;

    const len = getDistance(x1, y1, x2, y2);
    const dot = (((cx - x1) * (x2 - x1)) + ((cy - y1) * (y2 - y1))) / (len * len);

    const closestX = x1 + (dot * (x2 - x1));
    const closestY = y1 + (dot * (y2 - y1));

    if (!intersectionPointLine(Vector.Temp.set(closestX, closestY), line)) {
        return false;
    }

    return getDistance(closestX, closestY, cx, cy) <= radius;
};

// todo - add Line Ellipse intersection
const intersectionLineEllipse = (line: Line, ellipse: Ellipse): boolean => {
    throw new Error('Line Ellipse intersection is not implemented');

    return false;
};

const intersectionLinePoly = (line: Line, { points }: Polygon): boolean => {
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const curr = points[i];
        const next = points[(i + 1) % len];

        if (intersectionLineLine(line, Line.Temp.set(curr.x, curr.y, next.x, next.y))) {
            return true;
        }
    }

    return false;
};

const intersectionRectRect = ({ x: x1, y: y1, width: w1, height: h1 }: Rectangle, { x: x2, y: y2, width: w2, height: h2 }: Rectangle): boolean => {

    if (x2 > (x1 + w1) || y2 > (y1 + h1)) {
        return false;
    }

    if (x1 > (x2 + w2) || y1 > (y2 + h2)) {
        return false;
    }

    return true;
};

const intersectionRectCircle = ({ x: rx, y: ry, width, height }: Rectangle, { x: cx, y: cy, radius }: Circle): boolean => {
    const distX = clamp(cx, rx, rx + width);
    const distY = clamp(cy, ry, ry + height);

    return getDistance(cx, cy, distX, distY) <= radius;
};

// todo - add Rectangle Ellipse intersection
const intersectionRectEllipse = (rectangle: Rectangle, ellipse: Ellipse): boolean => {
    throw new Error('Rectangle Ellipse intersection is not implemented');

    return false;
};

const intersectionRectPoly = (rectangle: Rectangle, polygon: Polygon): boolean => intersectionSAT(rectangle, polygon);

const intersectionCircleCircle = ({ x: x1, y: y1, radius: r1 }: Circle, { x: x2, y: y2, radius: r2 }: Circle): boolean => {
    return getDistance(x1, y1, x2, y2) <= (r1 + r2);
};

// todo - add Circle Ellipse intersection
const intersectionCircleEllipse = (circle: Circle, ellipse: Ellipse): boolean => {
    throw new Error('Circle Ellipse intersection is not implemented');

    return false;
};

const excludeLeftVoronoi = (circlePos: Vector, prevPoint: Vector, prevEdge: Vector, point: Vector, radius: number, edge: Vector): boolean => {
    if (getVoronoiRegion(edge, point) !== VoronoiRegion.Left) {
        return false;
    }

    const point2 = circlePos.clone().subtract(prevPoint.x, prevPoint.y);
    const region = getVoronoiRegion(prevEdge, point2);

    return region === VoronoiRegion.Right && point.length > radius;
};

const excludeRightVoronoi = (circlePos: Vector, nextPoint: Vector, nextEdge: Vector, point: Vector, radius: number, edge: Vector): boolean => {
    if (getVoronoiRegion(edge, point) !== VoronoiRegion.Right) {
        return false;
    }

    const point2 = circlePos.clone().subtract(nextEdge.x, nextEdge.y);
    const region = getVoronoiRegion(nextEdge, point2);

    return region === VoronoiRegion.Left && point.length > radius;
};

const excludeMiddleVoronoi = (currentPoint: Vector, currentEdge: Vector, radius: number): boolean => {
    const normal = currentEdge.clone().rperp().normalize();
    const dist = currentPoint.dot(normal.x, normal.y);

    return (dist > 0) && Math.abs(dist) > radius;
};

const intersectionCirclePoly = ({ x: cx, y: cy, radius }: Circle, { x: px, y: py, points, edges }: Polygon): boolean => {
    const circlePos = new Vector((px - cx), (py - cy));
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const point = Vector.subtract(circlePos, points[i]);
        const prev = i === 0 ? len - 1 : i - 1;
        const next = (i + 1) % len;

        if (excludeLeftVoronoi(circlePos, points[prev], edges[prev], point, radius, edges[i])) {
            return false;
        }

        if (excludeRightVoronoi(circlePos, points[next], edges[next], point, radius, edges[i])) {
            return false;
        }

        if (excludeMiddleVoronoi(point, edges[i], radius)) {
            return false;
        }
    }

    return true;
};

// todo - add Ellipse Ellipse intersection
const intersectionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): boolean => {
    throw new Error('Ellipse Ellipse intersection is not implemented');

    return false;
};

// todo - add Ellipse Polygon intersection
const intersectionEllipsePoly = (ellipse: Ellipse, polygon: Polygon): boolean => {
    throw new Error('Ellipse Polygon intersection is not implemented');

    return false;
};

const intersectionPolyPoly = (polygonA: Polygon, polygonB: Polygon): boolean => intersectionSAT(polygonA, polygonB);

/**
 * COLLISION DETECTION
 */

const getCollisionRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): Collision | null => {
    if ((rectB.left > rectA.right) || (rectB.top > rectA.bottom)) {
        return null;
    }

    if ((rectA.left > rectB.right) || (rectA.top > rectB.bottom)) {
        return null;
    }

    return {
        shapeA: rectA,
        shapeB: rectB,
        overlap: 0, // todo
        shapeAInB: rectB.containsRect(rectA),
        shapeBInA: rectA.containsRect(rectB),
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): Collision | null => {
    const difference = new Vector(circleB.x - circleA.x, circleB.y - circleA.y),
        distance = difference.length,
        overlap = (circleA.radius + circleB.radius) - distance;

    if (overlap < 0) {
        return null;
    }

    return {
        shapeA: circleA,
        shapeB: circleB,
        overlap: overlap,
        shapeAInB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
        shapeBInA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        projectionN: difference.normalize(),
        projectionV: difference.multiply(overlap),
    };
};

const getCollisionCircleRectangle = (circle: Circle, rect: Rectangle, swap = false): Collision | null => {
    const radius = circle.radius,
        centerWidth = rect.width / 2,
        centerHeight = rect.height / 2,
        distance = getDistance(circle.x, circle.y, rect.x - centerWidth, rect.y - centerHeight),
        containsA = (radius <= Math.min(centerWidth, centerHeight)) && (distance <= (Math.min(centerWidth, centerHeight) - radius)),
        containsB = (Math.max(centerWidth, centerHeight) <= radius) && (distance <= (radius - Math.max(centerWidth, centerHeight)));

    if (distance > circle.radius) {
        return null;
    }

    return {
        shapeA: swap ? rect : circle,
        shapeB: swap ? circle : rect,
        overlap: radius - distance,
        shapeAInB: swap ? containsB : containsA,
        shapeBInA: swap ? containsA : containsB,
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

const getCollisionPolygonCircle = (polygon: Polygon, circle: Circle, swap = false): Collision | null => {
    const radius = circle.radius;
    const points = polygon.points;
    const x = (circle.x - polygon.x);
    const y = (circle.y - polygon.y);
    const projection = new Vector();
    const positionA = new Vector();
    const positionB = new Vector();
    const edgeA = new Vector();
    const edgeB = new Vector();
    const len = points.length;

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

        if (region === VoronoiRegion.Left) {
            const prev = points[(i === 0 ? len - 1 : i - 1)];

            edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
            positionB.set(x - prev.x, y - prev.y);

            if ((getVoronoiRegion(edgeB, positionB) === VoronoiRegion.Right)) {
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
        } else if (region === VoronoiRegion.Right) {
            const next = points[(i + 2) % len]; // pointB ?

            edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
            positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

            if (getVoronoiRegion(edgeB, positionB) === VoronoiRegion.Left) {
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
            const normal = edgeA.rperp().normalize();
            const distance = positionA.dot(normal.x, normal.y);

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

    return {
        shapeA: swap ? circle : polygon,
        shapeB: swap ? polygon : circle,
        overlap: overlap,
        shapeAInB: swap ? containsB : containsA,
        shapeBInA: swap ? containsA : containsB,
        projectionN: projection,
        projectionV: projection.multiply(overlap),
    };
};

const getCollisionSAT = (shapeA: Collidable, shapeB: Collidable): Collision | null => {
    const projection = new Vector();
    const normalsA = shapeA.getNormals();
    const normalsB = shapeB.getNormals();
    const projA = new Interval();
    const projB = new Interval();

    let overlap = Infinity;
    let shapeAInB = true;
    let shapeBInA = true;
    let containsA = false;
    let containsB = false;
    let distance = 0;

    for (const normal of normalsA) {
        shapeA.project(normal, projA);
        shapeB.project(normal, projB);

        if (!projA.overlaps(projB)) {
            return null;
        }

        distance = projA.getOverlap(projB);
        containsA = projB.containsInterval(projA);
        containsB = projA.containsInterval(projB);

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
        containsA = projB.containsInterval(projA);
        containsB = projA.containsInterval(projB);

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

    return {
        shapeA,
        shapeB,
        overlap,
        shapeAInB,
        shapeBInA,
        projectionN: projection,
        projectionV: projection.clone().multiply(overlap, overlap),
    };
};

export {
    intersectionSAT,
    intersectionPointPoint,
    intersectionPointLine,
    intersectionPointRect,
    intersectionPointCircle,
    intersectionPointEllipse,
    intersectionPointPoly,
    intersectionLineLine,
    intersectionLineRect,
    intersectionLineCircle,
    intersectionLineEllipse,
    intersectionLinePoly,
    intersectionRectRect,
    intersectionRectCircle,
    intersectionRectEllipse,
    intersectionRectPoly,
    intersectionCircleCircle,
    intersectionCircleEllipse,
    intersectionCirclePoly,
    intersectionEllipseEllipse,
    intersectionEllipsePoly,
    intersectionPolyPoly,

    getCollisionSAT,
    getCollisionRectangleRectangle,
    getCollisionCircleRectangle,
    getCollisionCircleCircle,
    getCollisionPolygonCircle,
}