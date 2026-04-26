import { Circle } from '@/math/Circle';
import { Ellipse } from '@/math/Ellipse';
import { Line } from '@/math/Line';
import { Polygon } from '@/math/Polygon';
import { Rectangle } from '@/math/Rectangle';
import { Vector } from '@/math/Vector';
import {
    intersectionCircleEllipse,
    intersectionEllipseEllipse,
    intersectionEllipsePoly,
    intersectionLineEllipse,
    intersectionRectEllipse,
} from '@/math/collision-detection';

describe('Ellipse intersections', () => {
    test('line/ellipse intersection works without throwing', () => {
        const ellipse = new Ellipse(0, 0, 5, 3);

        expect(intersectionLineEllipse(new Line(-10, 0, 10, 0), ellipse)).toBe(true);
        expect(intersectionLineEllipse(new Line(-10, 10, 10, 10), ellipse)).toBe(false);
    });

    test('rect/ellipse intersection works without throwing', () => {
        const ellipse = new Ellipse(0, 0, 5, 3);

        expect(intersectionRectEllipse(new Rectangle(-2, -2, 4, 4), ellipse)).toBe(true);
        expect(intersectionRectEllipse(new Rectangle(20, 20, 2, 2), ellipse)).toBe(false);
    });

    test('circle/ellipse intersection works without throwing', () => {
        const ellipse = new Ellipse(0, 0, 5, 3);

        expect(intersectionCircleEllipse(new Circle(4, 0, 2), ellipse)).toBe(true);
        expect(intersectionCircleEllipse(new Circle(20, 0, 1), ellipse)).toBe(false);
    });

    test('ellipse/ellipse intersection works without throwing', () => {
        expect(intersectionEllipseEllipse(new Ellipse(0, 0, 5, 3), new Ellipse(3, 0, 5, 3))).toBe(true);
        expect(intersectionEllipseEllipse(new Ellipse(0, 0, 5, 3), new Ellipse(20, 0, 2, 2))).toBe(false);
    });

    test('ellipse/polygon intersection works with polygon position offsets', () => {
        const polygon = new Polygon([
            new Vector(-2, -2),
            new Vector(2, -2),
            new Vector(0, 3),
        ], 10, 5);

        expect(intersectionEllipsePoly(new Ellipse(10, 5, 3, 2), polygon)).toBe(true);
        expect(intersectionEllipsePoly(new Ellipse(-10, -5, 1, 1), polygon)).toBe(false);
    });
});
