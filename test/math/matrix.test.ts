import { Matrix } from '@/math/Matrix';

describe('Matrix', () => {
    test('uses a valid identity matrix constant', () => {
        const identity = Matrix.identity;

        expect(identity.a).toBe(1);
        expect(identity.b).toBe(0);
        expect(identity.x).toBe(0);
        expect(identity.c).toBe(0);
        expect(identity.d).toBe(1);
        expect(identity.y).toBe(0);
        expect(identity.e).toBe(0);
        expect(identity.f).toBe(0);
        expect(identity.z).toBe(1);
    });
});
