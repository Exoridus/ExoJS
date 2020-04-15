import { RadiansPerDegree, DegreesPerRadian, VoronoiRegion } from '../const/math';
import { Vector } from '../math/Vector';

export const degreesToRadians = (degree: number): number => degree * RadiansPerDegree;

export const radiansToDegrees = (radian: number): number => radian * DegreesPerRadian;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const sign = (value: number): number => (value && (value < 0 ? -1 : 1));

export const lerp = (startValue: number, endValue: number, ratio: number): number => (
    ((1 - ratio) * startValue) + (ratio * endValue)
);

export const isPowerOfTwo = (value: number): boolean => (
    (value !== 0) && ((value & (value - 1)) === 0)
);

export const inRange = (value: number, min: number, max: number): boolean => (
    (value >= Math.min(min, max)) && (value <= Math.max(min, max))
);

export const getDistance = (x1: number, y1: number, x2: number, y2: number): number => {
    const offsetX = x1 - x2;
    const offsetY = y1 - y2;

    return Math.sqrt((offsetX * offsetX) + (offsetY * offsetY));
};

export const bezierCurveTo = (
    fromX: number,
    fromY: number,
    cpX1: number,
    cpY1: number,
    cpX2: number,
    cpY2: number,
    toX: number,
    toY: number,
    path: Array<number> = [],
    len = 20
): Array<number> => {
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
};

export const quadraticCurveTo = (
    fromX: number,
    fromY: number,
    cpX: number,
    cpY: number,
    toX: number,
    toY: number,
    path: Array<number> = [],
    len = 20
): Array<number> => {
    for (let i = 0; i <= len; i++) {
        const ratio = i / len;

        path.push(
            lerp(lerp(fromX, cpX, ratio), lerp(cpX, toX, ratio), ratio),
            lerp(lerp(fromY, cpY, ratio), lerp(cpY, toY, ratio), ratio)
        );
    }

    return path;
};

export const getVoronoiRegion = (line: Vector, point: Vector): number => {
    const product = point.dot(line.x, line.y);

    if (product < 0) {
        return VoronoiRegion.LEFT;
    } else if (product > line.lengthSq) {
        return VoronoiRegion.RIGHT;
    } else {
        return VoronoiRegion.MIDDLE;
    }
};
