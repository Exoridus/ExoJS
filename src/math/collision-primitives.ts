import { getDistance, inRange, VoronoiRegion } from '@/math/utils';
import type { PointLike } from '@/math/PointLike';

interface RectangleLikeLike extends PointLike {
    width: number;
    height: number;
}

interface CircleLikeLike extends PointLike {
    radius: number;
}

interface EllipseLikeLike extends PointLike {
    rx: number;
    ry: number;
}

interface PolygonLikeLike {
    x: number;
    y: number;
    points: Array<PointLike>;
}

const epsilon = 1e-10;

const getCurveSegments = (radiusA: number, radiusB = radiusA): number => (
    Math.max(16, Math.ceil(Math.sqrt(Math.max(radiusA, radiusB)) * 8))
);

const buildEllipsePoints = ({ x: centerX, y: centerY, rx, ry }: EllipseLikeLike): Array<PointLike> => {
    if (rx <= 0 || ry <= 0) {
        return [];
    }

    const segments = getCurveSegments(rx, ry);
    const delta = (Math.PI * 2) / segments;
    const points: Array<PointLike> = [];

    for (let i = 0; i < segments; i++) {
        const angle = i * delta;

        points.push({
            x: centerX + (Math.cos(angle) * rx),
            y: centerY + (Math.sin(angle) * ry),
        });
    }

    return points;
};

const buildCirclePoints = ({ x: centerX, y: centerY, radius }: CircleLikeLike): Array<PointLike> => {
    if (radius <= 0) {
        return [];
    }

    const segments = getCurveSegments(radius);
    const delta = (Math.PI * 2) / segments;
    const points: Array<PointLike> = [];

    for (let i = 0; i < segments; i++) {
        const angle = i * delta;

        points.push({
            x: centerX + (Math.cos(angle) * radius),
            y: centerY + (Math.sin(angle) * radius),
        });
    }

    return points;
};

const buildRectanglePoints = ({ x, y, width, height }: RectangleLikeLike): Array<PointLike> => ([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
]);

const buildPolygonWorldPoints = ({ x: offsetX, y: offsetY, points }: PolygonLikeLike): Array<PointLike> => (
    points.map(({ x, y }) => ({ x: x + offsetX, y: y + offsetY }))
);

const pointOnSegment = ({ x: px, y: py }: PointLike, { x: x1, y: y1 }: PointLike, { x: x2, y: y2 }: PointLike): boolean => (
    px <= Math.max(x1, x2) + epsilon
    && px >= Math.min(x1, x2) - epsilon
    && py <= Math.max(y1, y2) + epsilon
    && py >= Math.min(y1, y2) - epsilon
);

const orientation = ({ x: x1, y: y1 }: PointLike, { x: x2, y: y2 }: PointLike, { x: x3, y: y3 }: PointLike): number => {
    const determinant = ((y2 - y1) * (x3 - x2)) - ((x2 - x1) * (y3 - y2));

    if (Math.abs(determinant) <= epsilon) {
        return 0;
    }

    return determinant > 0 ? 1 : 2;
};

const segmentsIntersect = (a1: PointLike, a2: PointLike, b1: PointLike, b2: PointLike): boolean => {
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

const polygonContainsPoint = ({ x, y }: PointLike, points: Array<PointLike>): boolean => {
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

const polygonsIntersect = (polygonA: Array<PointLike>, polygonB: Array<PointLike>): boolean => {
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

const intersectionPointPoint = ({ x: x1, y: y1 }: PointLike, { x: x2, y: y2 }: PointLike, threshold = 0): boolean => (
    getDistance(x1, y1, x2, y2) <= threshold
);

const intersectionPointLineSegment = ({ x, y }: PointLike, { x: x1, y: y1 }: PointLike, { x: x2, y: y2 }: PointLike, threshold = 0.1): boolean => {
    const d1 = getDistance(x, y, x1, y1);
    const d2 = getDistance(x, y, x2, y2);
    const d3 = getDistance(x1, y1, x2, y2);

    return (d1 + d2) >= (d3 - threshold)
        && (d1 + d2) <= (d3 + threshold);
};

const intersectionPointRect = ({ x: x1, y: y1 }: PointLike, { x: x2, y: y2, width, height }: RectangleLikeLike): boolean => (
    inRange(x1, x2, x2 + width) && inRange(y1, y2, y2 + height)
);

const intersectionPointCircle = ({ x: x1, y: y1 }: PointLike, { x: x2, y: y2, radius }: CircleLikeLike): boolean => (
    radius > 0 && getDistance(x1, y1, x2, y2) <= radius
);

const intersectionPointEllipse = ({ x: x1, y: y1 }: PointLike, { x: x2, y: y2, rx, ry }: EllipseLikeLike): boolean => {
    if (rx <= 0 || ry <= 0) {
        return false;
    }

    const normX = (x1 - x2) / rx;
    const normY = (y1 - y2) / ry;

    return ((normX * normX) + (normY * normY)) <= 1;
};

const intersectionPointPoly = (point: PointLike, { points }: PolygonLikeLike): boolean => (
    polygonContainsPoint(point, points)
);

const intersectionLineLineSegments = (a1: PointLike, a2: PointLike, b1: PointLike, b2: PointLike): boolean => {
    const denominator = ((a2.x - a1.x) * (b2.y - b1.y)) - ((b2.x - b1.x) * (a2.y - a1.y));

    if (Math.abs(denominator) <= epsilon) {
        return false;
    }

    const uA = (((b2.x - b1.x) * (a1.y - b1.y)) - ((b2.y - b1.y) * (a1.x - b1.x))) / denominator;
    const uB = (((a2.x - a1.x) * (a1.y - b1.y)) - ((a2.y - a1.y) * (a1.x - b1.x))) / denominator;

    return uA >= 0 && uA <= 1
        && uB >= 0 && uB <= 1;
};

const intersectionRectRect = ({ x: x1, y: y1, width: w1, height: h1 }: RectangleLikeLike, { x: x2, y: y2, width: w2, height: h2 }: RectangleLikeLike): boolean => {
    if (x2 > (x1 + w1) || y2 > (y1 + h1)) {
        return false;
    }

    if (x1 > (x2 + w2) || y1 > (y2 + h2)) {
        return false;
    }

    return true;
};

const getVectorLength = (x: number, y: number): number => Math.sqrt((x * x) + (y * y));

const getVectorLengthSquared = (x: number, y: number): number => (x * x) + (y * y);

const getDotProduct = (x1: number, y1: number, x2: number, y2: number): number => (x1 * x2) + (y1 * y2);

const getVoronoiRegion = (lineX: number, lineY: number, pointX: number, pointY: number): VoronoiRegion => {
    const product = getDotProduct(pointX, pointY, lineX, lineY);
    const lengthSq = getVectorLengthSquared(lineX, lineY);

    if (product < 0) {
        return VoronoiRegion.left;
    }

    if (product > lengthSq) {
        return VoronoiRegion.right;
    }

    return VoronoiRegion.middle;
};

export {
    buildCirclePoints,
    buildEllipsePoints,
    buildPolygonWorldPoints,
    buildRectanglePoints,
    getDotProduct,
    getVectorLength,
    getVectorLengthSquared,
    getVoronoiRegion,
    intersectionLineLineSegments,
    intersectionPointCircle,
    intersectionPointEllipse,
    intersectionPointLineSegment,
    intersectionPointPoint,
    intersectionPointPoly,
    intersectionPointRect,
    intersectionRectRect,
    pointOnSegment,
    polygonContainsPoint,
    polygonsIntersect,
    segmentsIntersect,
};
