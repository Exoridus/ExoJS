import { Graphics } from '@/rendering/primitives/Graphics';

describe('Graphics', () => {
    test('drawArc appends a path and updates current point', () => {
        const graphics = new Graphics();

        graphics.lineWidth = 2;
        graphics.drawArc(0, 0, 10, 0, Math.PI / 2, false);

        expect(graphics.children.length).toBe(1);
        expect(graphics.currentPoint.x).toBeCloseTo(0, 4);
        expect(graphics.currentPoint.y).toBeCloseTo(10, 4);
    });

    test('arcTo creates a connecting segment + arc and updates current point', () => {
        const graphics = new Graphics();

        graphics.lineWidth = 2;
        graphics.moveTo(0, 0);
        graphics.arcTo(10, 0, 10, 10, 2);

        expect(graphics.children.length).toBeGreaterThanOrEqual(2);
        expect(graphics.currentPoint.x).toBeCloseTo(10, 4);
        expect(graphics.currentPoint.y).toBeCloseTo(2, 4);
    });
});
