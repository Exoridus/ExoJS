import { Ellipse } from '@/math/Ellipse';

describe('Ellipse', () => {
    test('returns bounds using diameter', () => {
        const ellipse = new Ellipse(10, 20, 5, 3);
        const bounds = ellipse.getBounds();

        expect(bounds.x).toBe(5);
        expect(bounds.y).toBe(17);
        expect(bounds.width).toBe(10);
        expect(bounds.height).toBe(6);
    });

    test('compares rx and ry correctly in equals()', () => {
        const ellipse = new Ellipse(4, 8, 12, 14);

        expect(ellipse.equals({ rx: 12, ry: 14 })).toBe(true);
        expect(ellipse.equals({ rx: 11 })).toBe(false);
        expect(ellipse.equals({ ry: 13 })).toBe(false);
    });
});
