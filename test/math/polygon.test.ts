import { Polygon } from '@/math/Polygon';
import { Vector } from '@/math/Vector';

describe('Polygon', () => {
    test('setPoints handles shrinking point arrays safely', () => {
        const polygon = new Polygon([
            new Vector(0, 0),
            new Vector(10, 0),
            new Vector(10, 10),
            new Vector(0, 10),
        ]);

        expect(() => polygon.setPoints([
            new Vector(0, 0),
            new Vector(20, 0),
            new Vector(10, 10),
        ])).not.toThrow();
        expect(polygon.points.length).toBe(3);
        expect(polygon.edges.length).toBe(3);
        expect(polygon.normals.length).toBe(3);
    });
});
