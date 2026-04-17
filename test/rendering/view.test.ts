import { Rectangle } from 'math/Rectangle';
import { View } from 'rendering/View';

describe('View', () => {
    test('follow updates center toward target', () => {
        const view = new View(0, 0, 100, 100);
        const target = { x: 80, y: 40 };

        view.follow(target);
        view.update(16);

        expect(view.center.x).toBe(80);
        expect(view.center.y).toBe(40);

        view.setCenter(0, 0);
        view.follow(target, { lerp: 0.5 });
        view.update(16);

        expect(view.center.x).toBeCloseTo(40);
        expect(view.center.y).toBeCloseTo(20);
    });

    test('bounds clamp keeps center within world limits', () => {
        const view = new View(0, 0, 100, 100);

        view.setBounds(new Rectangle(0, 0, 200, 200));
        view.setCenter(300, 300);
        view.update(16);

        expect(view.center.x).toBe(150);
        expect(view.center.y).toBe(150);
    });

    test('shake offsets while active and resets when finished', () => {
        const view = new View(0, 0, 100, 100);
        const baseline = view.getBounds().clone();

        view.shake(8, 100, { frequency: 12 });
        view.update(16);

        const shaken = view.getBounds().clone();
        expect(shaken.left !== baseline.left || shaken.top !== baseline.top).toBe(true);

        view.update(200);

        const settled = view.getBounds();
        expect(settled.left).toBeCloseTo(baseline.left);
        expect(settled.top).toBeCloseTo(baseline.top);
    });

    test('zoom helpers adjust size predictably', () => {
        const view = new View(0, 0, 200, 100);

        view.setZoom(2);
        expect(view.zoomLevel).toBe(2);
        expect(view.width).toBeCloseTo(100);
        expect(view.height).toBeCloseTo(50);

        view.zoomOut(0.5);
        expect(view.zoomLevel).toBeCloseTo(1.5);
        expect(view.width).toBeCloseTo(200 / 1.5);

        view.zoomIn(0.5);
        expect(view.zoomLevel).toBeCloseTo(2);
    });
});
