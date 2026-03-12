import { Interval } from 'math/Interval';
import { clamp, getDistance, VoronoiRegion } from 'utils/math';
import {
    buildCirclePoints,
    buildEllipsePoints,
    buildPolygonWorldPoints,
    buildRectanglePoints,
    getVectorLength,
    getVoronoiRegion as getVoronoiRegionForPoint,
    intersectionLineLineSegments,
    intersectionPointCircle as intersectionPrimitivePointCircle,
    intersectionPointEllipse as intersectionPrimitivePointEllipse,
    intersectionPointLineSegment,
    intersectionPointPoint as intersectionPrimitivePointPoint,
    intersectionPointPoly as intersectionPrimitivePointPoly,
    intersectionPointRect as intersectionPrimitivePointRect,
    intersectionRectRect as intersectionPrimitiveRectRect,
    polygonsIntersect,
} from './collision-primitives';
import type { ICollidable, ICollisionResponse } from 'types/Collision';
import type { Circle } from 'math/Circle';
import type { Ellipse } from 'math/Ellipse';
import type { Line } from 'math/Line';
import type { Polygon } from 'math/Polygon';
import type { Rectangle } from 'math/Rectangle';
import type { IPoint } from 'types/primitives/IPoint';

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

const intersectionPointPoint = (pointA: IPoint, pointB: IPoint, threshold = 0): boolean => (
    intersectionPrimitivePointPoint(pointA, pointB, threshold)
);

const intersectionPointLine = (point: IPoint, line: Line, threshold = 0.1): boolean => (
    intersectionPointLineSegment(point, line.fromPosition, line.toPosition, threshold)
);

const intersectionPointRect = (point: IPoint, rectangle: Rectangle): boolean => (
    intersectionPrimitivePointRect(point, rectangle)
);

const intersectionPointCircle = (point: IPoint, circle: Circle): boolean => (
    intersectionPrimitivePointCircle(point, circle)
);

const intersectionPointEllipse = (point: IPoint, ellipse: Ellipse): boolean => (
    intersectionPrimitivePointEllipse(point, ellipse)
);

const intersectionPointPoly = (point: IPoint, polygon: Polygon): boolean => (
    intersectionPrimitivePointPoly(point, polygon)
);

const intersectionLineLine = (lineA: Line, lineB: Line): boolean => (
    intersectionLineLineSegments(lineA.fromPosition, lineA.toPosition, lineB.fromPosition, lineB.toPosition)
);

const intersectionLineRect = (line: Line, rectangle: Rectangle): boolean => {
    const { x, y, width, height } = rectangle;
    const topLeft = { x, y };
    const topRight = { x: x + width, y };
    const bottomLeft = { x, y: y + height };
    const bottomRight = { x: x + width, y: y + height };

    return intersectionLineLineSegments(line.fromPosition, line.toPosition, topLeft, bottomLeft)
        || intersectionLineLineSegments(line.fromPosition, line.toPosition, topRight, bottomRight)
        || intersectionLineLineSegments(line.fromPosition, line.toPosition, topLeft, topRight)
        || intersectionLineLineSegments(line.fromPosition, line.toPosition, bottomLeft, bottomRight);
};

const intersectionLineCircle = (line: Line, circle: Circle): boolean => {
    if (intersectionPointCircle(line.fromPosition, circle) || intersectionPointCircle(line.toPosition, circle)) {
        return true;
    }

    const { fromX: x1, fromY: y1, toX: x2, toY: y2 } = line;
    const { x: cx, y: cy, radius } = circle;

    const len = getDistance(x1, y1, x2, y2);

    if (len === 0) {
        return false;
    }

    const dot = (((cx - x1) * (x2 - x1)) + ((cy - y1) * (y2 - y1))) / (len * len);
    const closestX = x1 + (dot * (x2 - x1));
    const closestY = y1 + (dot * (y2 - y1));

    if (!intersectionPointLineSegment({ x: closestX, y: closestY }, line.fromPosition, line.toPosition)) {
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

    if (a <= Number.EPSILON) {
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

const intersectionLinePoly = (line: Line, polygon: Polygon): boolean => {
    const { x: offsetX, y: offsetY, points } = polygon;
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const curr = points[i];
        const next = points[(i + 1) % len];

        if (intersectionLineLineSegments(
            line.fromPosition,
            line.toPosition,
            { x: curr.x + offsetX, y: curr.y + offsetY },
            { x: next.x + offsetX, y: next.y + offsetY },
        )) {
            return true;
        }
    }

    return false;
};

const intersectionRectRect = (rectA: Rectangle, rectB: Rectangle): boolean => (
    intersectionPrimitiveRectRect(rectA, rectB)
);

const intersectionRectCircle = ({ x: rx, y: ry, width, height }: Rectangle, { x: cx, y: cy, radius }: Circle): boolean => {
    const distX = clamp(cx, rx, rx + width);
    const distY = clamp(cy, ry, ry + height);

    return getDistance(cx, cy, distX, distY) <= radius;
};

const intersectionRectEllipse = (rectangle: Rectangle, ellipse: Ellipse): boolean => (
    polygonsIntersect(buildRectanglePoints(rectangle), buildEllipsePoints(ellipse))
);

const intersectionRectPoly = (rectangle: Rectangle, polygon: Polygon): boolean => intersectionSat(rectangle, polygon);

const intersectionCircleCircle = ({ x: x1, y: y1, radius: r1 }: Circle, { x: x2, y: y2, radius: r2 }: Circle): boolean => (
    getDistance(x1, y1, x2, y2) <= (r1 + r2)
);

const intersectionCircleEllipse = (circle: Circle, ellipse: Ellipse): boolean => (
    polygonsIntersect(buildCirclePoints(circle), buildEllipsePoints(ellipse))
);

const shouldExcludeLeftVoronoi = (
    circleX: number,
    circleY: number,
    prevPoint: IPoint,
    prevEdge: IPoint,
    pointX: number,
    pointY: number,
    radius: number,
    edgeX: number,
    edgeY: number,
): boolean => {
    if (getVoronoiRegionForPoint(edgeX, edgeY, pointX, pointY) !== VoronoiRegion.left) {
        return false;
    }

    const region = getVoronoiRegionForPoint(prevEdge.x, prevEdge.y, circleX - prevPoint.x, circleY - prevPoint.y);

    return region === VoronoiRegion.right && getVectorLength(pointX, pointY) > radius;
};

const shouldExcludeRightVoronoi = (
    circleX: number,
    circleY: number,
    nextPoint: IPoint,
    nextEdge: IPoint,
    pointX: number,
    pointY: number,
    radius: number,
    edgeX: number,
    edgeY: number,
): boolean => {
    if (getVoronoiRegionForPoint(edgeX, edgeY, pointX, pointY) !== VoronoiRegion.right) {
        return false;
    }

    const region = getVoronoiRegionForPoint(nextEdge.x, nextEdge.y, circleX - nextPoint.x, circleY - nextPoint.y);

    return region === VoronoiRegion.left && getVectorLength(pointX, pointY) > radius;
};

const shouldExcludeMiddleVoronoi = (
    pointX: number,
    pointY: number,
    radius: number,
    edgeX: number,
    edgeY: number,
): boolean => {
    const normalX = edgeY;
    const normalY = -edgeX;
    const normalLength = getVectorLength(normalX, normalY);

    if (normalLength === 0) {
        return false;
    }

    const distance = ((pointX * normalX) + (pointY * normalY)) / normalLength;

    return distance > 0 && Math.abs(distance) > radius;
};

const intersectionCirclePoly = ({ x: cx, y: cy, radius }: Circle, { x: px, y: py, points, edges }: Polygon): boolean => {
    const circleX = px - cx;
    const circleY = py - cy;
    const len = points.length;

    for (let i = 0; i < len; i++) {
        const point = points[i];
        const pointX = circleX - point.x;
        const pointY = circleY - point.y;
        const prev = i === 0 ? len - 1 : i - 1;
        const next = (i + 1) % len;
        const edge = edges[i];

        if (shouldExcludeLeftVoronoi(circleX, circleY, points[prev], edges[prev], pointX, pointY, radius, edge.x, edge.y)) {
            return false;
        }

        if (shouldExcludeRightVoronoi(circleX, circleY, points[next], edges[next], pointX, pointY, radius, edge.x, edge.y)) {
            return false;
        }

        if (shouldExcludeMiddleVoronoi(pointX, pointY, radius, edge.x, edge.y)) {
            return false;
        }
    }

    return true;
};

const intersectionEllipseEllipse = (ellipseA: Ellipse, ellipseB: Ellipse): boolean => (
    polygonsIntersect(buildEllipsePoints(ellipseA), buildEllipsePoints(ellipseB))
);

const intersectionEllipsePoly = (ellipse: Ellipse, polygon: Polygon): boolean => (
    polygonsIntersect(buildEllipsePoints(ellipse), buildPolygonWorldPoints(polygon))
);

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

    const zeroNormal = rectA.position.clone().set(0, 0);
    const zeroVector = rectA.position.clone().set(0, 0);

    return {
        shapeA: rectA,
        shapeB: rectB,
        overlap: 0, // todo
        shapeAinB: rectB.containsRect(rectA),
        shapeBinA: rectA.containsRect(rectB),
        projectionN: zeroNormal,
        projectionV: zeroVector,
    };
};

const getCollisionCircleCircle = (circleA: Circle, circleB: Circle): ICollisionResponse | null => {
    const difference = circleB.position.clone().subtract(circleA.x, circleA.y);
    const distance = difference.length;
    const overlap = (circleA.radius + circleB.radius) - distance;

    if (overlap < 0) {
        difference.destroy();
        return null;
    }

    const projectionN = difference.clone().normalize();
    const projectionV = difference.multiply(overlap);

    return {
        shapeA: circleA,
        shapeB: circleB,
        overlap,
        shapeAinB: (circleA.radius <= circleB.radius) && (distance <= (circleB.radius - circleA.radius)),
        shapeBinA: (circleB.radius <= circleA.radius) && (distance <= (circleA.radius - circleB.radius)),
        projectionN,
        projectionV,
    };
};

const getCollisionCircleRectangle = (circle: Circle, rect: Rectangle, swap = false): ICollisionResponse | null => {
    const radius = circle.radius;
    const centerWidth = rect.width / 2;
    const centerHeight = rect.height / 2;
    const distance = getDistance(circle.x, circle.y, rect.x - centerWidth, rect.y - centerHeight);
    const containsA = (radius <= Math.min(centerWidth, centerHeight)) && (distance <= (Math.min(centerWidth, centerHeight) - radius));
    const containsB = (Math.max(centerWidth, centerHeight) <= radius) && (distance <= (radius - Math.max(centerWidth, centerHeight)));

    if (distance > circle.radius) {
        return null;
    }

    const zeroNormal = circle.position.clone().set(0, 0);
    const zeroVector = circle.position.clone().set(0, 0);

    return {
        shapeA: swap ? rect : circle,
        shapeB: swap ? circle : rect,
        overlap: radius - distance,
        shapeAinB: swap ? containsB : containsA,
        shapeBinA: swap ? containsA : containsB,
        projectionN: zeroNormal,
        projectionV: zeroVector,
    };
};

const getCollisionPolygonCircle = (polygon: Polygon, circle: Circle, swap = false): ICollisionResponse | null => {
    const radius = circle.radius;
    const points = polygon.points;
    const x = circle.x - polygon.x;
    const y = circle.y - polygon.y;
    const projection = circle.position.clone().set(0, 0);
    const len = points.length;

    let containsA = true;
    let containsB = true;
    let overlap = Infinity;

    for (let i = 0; i < len; i++) {
        const pointA = points[i];
        const pointB = points[(i + 1) % len];
        const edgeAx = pointB.x - pointA.x;
        const edgeAy = pointB.y - pointA.y;
        const positionAx = x - pointA.x;
        const positionAy = y - pointA.y;
        const region = getVoronoiRegionForPoint(edgeAx, edgeAy, positionAx, positionAy);
        const pointDistanceA = getVectorLength(positionAx, positionAy);

        if (pointDistanceA > radius) {
            containsA = false;
        }

        if (region === VoronoiRegion.left) {
            const prev = points[i === 0 ? len - 1 : i - 1];
            const edgeBx = pointA.x - prev.x;
            const edgeBy = pointA.y - prev.y;
            const positionBx = x - prev.x;
            const positionBy = y - prev.y;

            if (getVoronoiRegionForPoint(edgeBx, edgeBy, positionBx, positionBy) === VoronoiRegion.right) {
                if (pointDistanceA > radius) {
                    projection.destroy();
                    return null;
                }

                const candidateOverlap = radius - pointDistanceA;

                if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
                    overlap = candidateOverlap;
                    projection.set(positionAx, positionAy).normalize();
                }

                containsB = false;
            }
        } else if (region === VoronoiRegion.right) {
            const next = points[(i + 2) % len];
            const edgeBx = next.x - pointB.x;
            const edgeBy = next.y - pointB.y;
            const positionBx = x - pointB.x;
            const positionBy = y - pointB.y;
            const pointDistanceB = getVectorLength(positionBx, positionBy);

            if (getVoronoiRegionForPoint(edgeBx, edgeBy, positionBx, positionBy) === VoronoiRegion.left) {
                if (pointDistanceB > radius) {
                    projection.destroy();
                    return null;
                }

                const candidateOverlap = radius - pointDistanceB;

                if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
                    overlap = candidateOverlap;
                    projection.set(positionBx, positionBy).normalize();
                }

                containsB = false;
            }
        } else {
            const normalX = edgeAy;
            const normalY = -edgeAx;
            const normalLength = getVectorLength(normalX, normalY);
            const distance = normalLength === 0 ? 0 : ((positionAx * normalX) + (positionAy * normalY)) / normalLength;

            if (distance > 0 && Math.abs(distance) > radius) {
                projection.destroy();
                return null;
            }

            if (distance >= 0 || (radius - distance) < (2 * radius)) {
                containsB = false;
            }

            const candidateOverlap = radius - distance;

            if (Math.abs(candidateOverlap) < Math.abs(overlap)) {
                overlap = candidateOverlap;
                projection.set(normalX, normalY).normalize();
            }
        }
    }

    const projectionV = projection.clone().multiply(overlap);

    return {
        shapeA: swap ? circle : polygon,
        shapeB: swap ? polygon : circle,
        overlap,
        shapeAinB: swap ? containsB : containsA,
        shapeBinA: swap ? containsA : containsB,
        projectionN: projection,
        projectionV,
    };
};

const getCollisionSat = (shapeA: ICollidable, shapeB: ICollidable): ICollisionResponse | null => {
    const normalsA = shapeA.getNormals();
    const normalsB = shapeB.getNormals();
    const projection = (normalsA[0] || normalsB[0]).clone();
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
            projection.destroy();
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
                Math.abs(projA.max - projB.max),
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
            projection.destroy();
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
                Math.abs(projA.max - projB.max),
            );
        }

        if (distance < overlap) {
            overlap = distance;
            projection.copy(normal);
        }
    }

    const projectionV = projection.clone().multiply(overlap, overlap);

    return {
        shapeA,
        shapeB,
        overlap,
        shapeAinB,
        shapeBinA,
        projectionN: projection,
        projectionV,
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
};
