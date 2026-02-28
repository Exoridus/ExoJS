import { Vector } from 'math/Vector';
import { Interval } from 'math/Interval';
import { Line } from 'math/Line';
import { clamp, getDistance, getVoronoiRegion, inRange, VoronoiRegion } from 'utils/math';
import type { ICollidable, ICollisionResponse } from 'types/Collision';
import type { Polygon } from 'math/Polygon';
import type { Rectangle } from 'math/Rectangle';
import type { Circle } from 'math/Circle';
import type { Ellipse } from 'math/Ellipse';
import type { IPoint } from 'types/primitives/IPoint';

const epsilon = 1e-10;

const getCurveSegments = (radiusA: number, radiusB = radiusA): number => (
    Math.max(16, Math.ceil(Math.sqrt(Math.max(radiusA, radiusB)) * 8))
);

const buildEllipsePoints = ({ x: centerX, y: centerY, rx, ry }: Ellipse): Array<IPoint> => {
    if (rx <= 0 || ry <= 0) {
        return [];
    }

    const segments = getCurveSegments(rx, ry);
    const delta = (Math.PI * 2) / segments;
    const points: Array<IPoint> = [];

    for (let i = 0; i < segments; i++) {
        const angle = i * delta;

        points.push({
            x: centerX + (Math.cos(angle) * rx),
            y: centerY + (Math.sin(angle) * ry),
        });
    }

    return points;
};

const buildCirclePoints = ({ x: centerX, y: centerY, radius }: Circle): Array<IPoint> => {
    if (radius <= 0) {
        return [];
    }

    const segments = getCurveSegments(radius);
    const delta = (Math.PI * 2) / segments;
    const points: Array<IPoint> = [];

    for (let i = 0; i < segments; i++) {
        const angle = i * delta;

        points.push({
            x: centerX + (Math.cos(angle) * radius),
            y: centerY + (Math.sin(angle) * radius),
        });
    }

    return points;
};

const buildRectanglePoints = ({ x, y, width, height }: Rectangle): Array<IPoint> => ([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
]);

const buildPolygonWorldPoints = ({ x: offsetX, y: offsetY, points }: Polygon): Array<IPoint> => (
    points.map(({ x, y }) => ({ x: x + offsetX, y: y + offsetY }))
);

const pointOnSegment = ({ x: px, y: py }: IPoint, { x: x1, y: y1 }: IPoint, { x: x2, y: y2 }: IPoint): boolean => (
    px <= Math.max(x1, x2) + epsilon
    && px >= Math.min(x1, x2) - epsilon
    && py <= Math.max(y1, y2) + epsilon
    && py >= Math.min(y1, y2) - epsilon
);

const orientation = ({ x: x1, y: y1 }: IPoint, { x: x2, y: y2 }: IPoint, { x: x3, y: y3 }: IPoint): number => {
    const determinant = ((y2 - y1) * (x3 - x2)) - ((x2 - x1) * (y3 - y2));

    if (Math.abs(determinant) <= epsilon) {
        return 0;
    }

    return determinant > 0 ? 1 : 2;
};

const segmentsIntersect = (a1: IPoint, a2: IPoint, b1: IPoint, b2: IPoint): boolean => {
    const o1 = orientation(a1, a2, b1);
    const o2 = orientation(a1, a2, b2);
    const o3 = orientation(b1, b2, a1);
    const o4 = orientation(b1, b2, a2);

    if (o1 !== o2 && o3 !== o4) {
        return true;
    }

    if (o1 === 0 && pointOnSegment(b1, a1, a2)) {
        return true;
    }

    if (o2 === 0 && pointOnSegment(b2, a1, a2)) {
        return true;
    }

    if (o3 === 0 && pointOnSegment(a1, b1, b2)) {
        return true;
    }

    if (o4 === 0 && pointOnSegment(a2, b1, b2)) {
        return true;
    }

    return false;
};

const polygonContainsPoint = ({ x, y }: IPoint, points: Array<IPoint>): boolean => {
    const len = points.length;

    if (len < 3) {
        return false;
    }

    let inside = false;

    for (let current = 0, previous = len - 1; current < len; previous = current++) {
        const prev = points[previous];
        const curr = points[current];

        if (((curr.y > y) !== (prev.y > y)) && (x < ((prev.x - curr.x) * ((y - curr.y) / (prev.y - curr.y))) + curr.x)) {
            inside = !inside;
        }
    }

    return inside;
};

const polygonsIntersect = (polygonA: Array<IPoint>, polygonB: Array<IPoint>): boolean => {
    if (polygonA.length === 0 || polygonB.length === 0) {
        return false;
    }

    for (let i = 0; i < polygonA.length; i++) {
        const a1 = polygonA[i];
        const a2 = polygonA[(i + 1) % polygonA.length];

        for (let j = 0; j < polygonB.length; j++) {
            const b1 = polygonB[j];
            const b2 = polygonB[(j + 1) % polygonB.length];

            if (segmentsIntersect(a1, a2, b1, b2)) {
                return true;
            }
        }
    }

    return polygonContainsPoint(polygonA[0], polygonB)
        || polygonContainsPoint(polygonB[0], polygonA);
};

/**
 * INTERSECTION
 */

const intersectionSat = (shapeA: ICollidable, shapeB: ICollidable): boolean => {
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

const intersectionPointPoint = ({ x: x1, y: y1 }: IPoint, { x: x2, y: y2 }: IPoint, threshold = 0): boolean => (
    getDistance(x1, y1, x2, y2) <= threshold
);

const intersectionPointLine = ({ x, y }: IPoint, { fromX, fromY, toX, toY }: Line, threshold = 0.1): boolean => {
    const d1 = getDistance(x, y, fromX, fromY);
    const d2 = getDistance(x, y, toX, toY);
    const d3 = getDistance(fromX, fromY, toX, toY);

    return (d1 + d2) >= (d3 - threshold)
        && (d1 + d2) <= (d3 + threshold);
};

const intersectionPointRect = ({ x: x1, y: y1 }: IPoint, { x: x2, y: y2, width, height }: Rectangle): boolean => (
    inRange(x1, x2, x2 + width) && inRange(y1, y2, y2 + height)
);

const intersectionPointCircle = ({ x: x1, y: y1 }: IPoint, { x: x2, y: y2, radius }: Circle): boolean => (
    radius > 0 && getDistance(x1, y1, x2, y2) <= radius
);

const intersectionPointEllipse = ({ x: x1, y: y1 }: IPoint, { x: x2, y: y2, rx, ry }: Ellipse): boolean => {
    if (rx <= 0 || ry <= 0) {
        return false;
    }

    const normX = (x1 - x2) / rx;
    const normY = (y1 - y2) / ry;

    return ((normX * normX) + (normY * normY)) <= 1;
};

const intersectionPointPoly = ({ x, y }: IPoint, { points }: Polygon): boolean => {
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
    return intersectionLineLine(line, Line.temp.set(x, y, x, y + height))
        || intersectionLineLine(line, Line.temp.set(x + width, y, x + width, y + height))
        || intersectionLineLine(line, Line.temp.set(x, y, x + width, y))
        || intersectionLineLine(line, Line.temp.set(x, y + height, x + width, y + height));
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

    if (!intersectionPointLine(Vector.temp.set(closestX, closestY), line)) {
        return false;
    }

    return getDistance(closestX, closestY, cx, cy) <= radius;
};

const intersectionLineEllipse = (line: Line, ellipse: Ellipse): boolean => {
    const { x: centerX, y: centerY, rx, ry } = ellipse;

    if (rx <= 0 || ry <= 0) {
        return false;
    }

    const x1 = (line.fromX - centerX) / rx;
    const y1 = (line.fromY - centerY) / ry;
    const x2 = (line.toX - centerX) / rx;
    const y2 = (line.toY - centerY) / ry;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const a = (dx * dx) + (dy * dy);
    const b = 2 * ((x1 * dx) + (y1 * dy));
    const c = (x1 * x1) + (y1 * y1) - 1;

    if (c <= 0) {
        return true;
    }

    if (a <= epsilon) {
        return false;
    }

    const discriminant = (b * b) - (4 * a * c);

    if (discriminant < 0) {
        return false;
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const tA = (-b - sqrtDiscriminant) / (2 * a);
    const tB = (-b + sqrtDiscriminant) / (2 * a);

    return (tA >= 0 && tA <= 1) || (tB >= 0 && tB <= 1);
};

const intersectionLinePoly = (line: Line, { points }: Polygon): boolean => {
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const curr = points[i];
        const next = points[(i + 1) % len];

        if (intersectionLineLine(line, Line.temp.set(curr.x, curr.y, next.x, next.y))) {
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

const intersectionRectEllipse = (rectangle: Rectangle, ellipse: Ellipse): boolean => {
    return polygonsIntersect(buildRectanglePoints(rectangle), buildEllipsePoints(ellipse));
};

const intersectionRectPoly = (rectangle: Rectangle, polygon: Polygon): boolean => intersectionSat(rectangle, polygon);

const intersectionCircleCircle = ({ x: x1, y: y1, radius: r1 }: Circle, { x: x2, y: y2, radius: r2 }: Circle): boolean => {
    return getDistance(x1, y1, x2, y2) <= (r1 + r2);
};

const intersectionCircleEllipse = (circle: Circle, ellipse: Ellipse): boolean => {
    return polygonsIntersect(buildCirclePoints(circle), buildEllipsePoints(ellipse));
};

const excludeLeftVoronoi = (circlePos: Vector, prevPoint: Vector, prevEdge: Vector, point: Vector, radius: number, edge: Vector): boolean => {
    if (getVoronoiRegion(edge, point) !== VoronoiRegion.left) {
        return false;
    }

    const point2 = circlePos.clone().subtract(prevPoint.x, prevPoint.y);
    const region = getVoronoiRegion(prevEdge, point2);

    return region === VoronoiRegion.right && point.length > radius;
};

const excludeRightVoronoi = (circlePos: Vector, nextPoint: Vector, nextEdge: Vector, point: Vector, radius: number, edge: Vector): boolean => {
    if (getVoronoiRegion(edge, point) !== VoronoiRegion.right) {
        return false;
    }

    const point2 = circlePos.clone().subtract(nextEdge.x, nextEdge.y);
    const region = getVoronoiRegion(nextEdge, point2);

    return region === VoronoiRegion.left && point.length > radius;
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

const intersectionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): boolean => {
    return polygonsIntersect(buildEllipsePoints(ellipseA), buildEllipsePoints(ellipseB));
};

const intersectionEllipsePoly = (ellipse: Ellipse, polygon: Polygon): boolean => {
    return polygonsIntersect(buildEllipsePoints(ellipse), buildPolygonWorldPoints(polygon));
};

const intersectionPolyPoly = (polygonA: Polygon, polygonB: Polygon): boolean => intersectionSat(polygonA, polygonB);

/**
 * COLLISION DETECTION
 */

const getCollisionRectangleRectangle = (rectA: Rectangle, rectB: Rectangle): ICollisionResponse | null => {
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
        shapeAinB: rectB.containsRect(rectA),
        shapeBinA: rectA.containsRect(rectB),
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): ICollisionResponse | null => {
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
        shapeAinB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
        shapeBinA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        projectionN: difference.normalize(),
        projectionV: difference.multiply(overlap),
    };
};

const getCollisionCircleRectangle = (circle: Circle, rect: Rectangle, swap = false): ICollisionResponse | null => {
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
        shapeAinB: swap ? containsB : containsA,
        shapeBinA: swap ? containsA : containsB,
        projectionN: new Vector(), // todo
        projectionV: new Vector(), // todo
    };
};

const getCollisionPolygonCircle = (polygon: Polygon, circle: Circle, swap = false): ICollisionResponse | null => {
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

        if (region === VoronoiRegion.left) {
            const prev = points[(i === 0 ? len - 1 : i - 1)];

            edgeB.set(pointA.x - prev.x, pointA.y - prev.y);
            positionB.set(x - prev.x, y - prev.y);

            if ((getVoronoiRegion(edgeB, positionB) === VoronoiRegion.right)) {
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
        } else if (region === VoronoiRegion.right) {
            const next = points[(i + 2) % len]; // pointB ?

            edgeB.set(next.x - pointB.x, next.y - pointB.y); // edgeB.set(pointB.x - pointA.x, pointB.y - pointA.y); ?
            positionB.set(x - pointB.x, y - pointB.y); // positionB.set(x - pointB.x, y - pointB.y); ?

            if (getVoronoiRegion(edgeB, positionB) === VoronoiRegion.left) {
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
        shapeAinB: swap ? containsB : containsA,
        shapeBinA: swap ? containsA : containsB,
        projectionN: projection,
        projectionV: projection.multiply(overlap),
    };
};

const getCollisionSat = (shapeA: ICollidable, shapeB: ICollidable): ICollisionResponse | null => {
    const projection = new Vector();
    const normalsA = shapeA.getNormals();
    const normalsB = shapeB.getNormals();
    const projA = new Interval();
    const projB = new Interval();

    let overlap = Infinity;
    let shapeAinB = true;
    let shapeBinA = true;
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

        if (!containsA && shapeAinB) {
            shapeAinB = false;
        }

        if (!containsB && shapeBinA) {
            shapeBinA = false;
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

        if (!containsA && shapeAinB) {
            shapeAinB = false;
        }

        if (!containsB && shapeBinA) {
            shapeBinA = false;
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
        shapeAinB,
        shapeBinA,
        projectionN: projection,
        projectionV: projection.clone().multiply(overlap, overlap),
    };
};

export {
    intersectionSat,

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

    getCollisionSat,
    getCollisionRectangleRectangle,
    getCollisionCircleRectangle,
    getCollisionCircleCircle,
    getCollisionPolygonCircle,
}
