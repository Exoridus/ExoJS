import { Circle } from '@/math/Circle';
import { Vector } from '@/math/Vector';

describe('Circle', () => {
    test('projects correctly on an axis', () => {
        const circle = new Circle(10, 5, 3);
        const xAxis = new Vector(1, 0);
        const interval = circle.project(xAxis);

        expect(interval.min).toBeCloseTo(7);
        expect(interval.max).toBeCloseTo(13);
    });

    test('projects correctly on non-normalized axis', () => {
        const circle = new Circle(10, 5, 3);
        const axis = new Vector(3, 4);
        const interval = circle.project(axis);

        expect(interval.min).toBeCloseTo(35);
        expect(interval.max).toBeCloseTo(65);
    });
});
