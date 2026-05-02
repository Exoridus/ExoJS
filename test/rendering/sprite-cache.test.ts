import { Rectangle } from '@/math/Rectangle';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Container } from '@/rendering/Container';
import type { Texture } from '@/rendering/texture/Texture';

const makeTexture = (w = 128, h = 64): Texture => ({
    width: w,
    height: h,
    flipY: false,
    updateSource: () => undefined,
} as unknown as Texture);

// ---------------------------------------------------------------------------
// Sprite vertices caching
// ---------------------------------------------------------------------------

describe('Sprite.vertices — dirty-flag cache', () => {
    test('same Float32Array reference returned on repeated reads when nothing changed', () => {
        const sprite = new Sprite(makeTexture());

        const v1 = sprite.vertices;
        const v2 = sprite.vertices;
        const v3 = sprite.vertices;

        expect(v1).toBe(v2);
        expect(v2).toBe(v3);

        sprite.destroy();
    });

    test('vertices recomputed after setPosition', () => {
        const sprite = new Sprite(makeTexture());

        sprite.setPosition(0, 0);
        const x0Before = sprite.vertices[0];

        sprite.setPosition(50, 0);
        const x0After = sprite.vertices[0];

        expect(x0After).not.toBeCloseTo(x0Before);
        expect(x0After).toBeCloseTo(x0Before + 50);

        sprite.destroy();
    });

    test('vertices recomputed after setTextureFrame', () => {
        const texture = makeTexture(256, 256);
        const sprite = new Sprite(texture);

        sprite.setPosition(0, 0);

        const frameA = new Rectangle(0, 0, 64, 64);
        sprite.setTextureFrame(frameA);

        // With no rotation, vertex[2] is right edge: 64
        const rightBefore = sprite.vertices[2];

        const frameB = new Rectangle(0, 0, 128, 64);
        sprite.setTextureFrame(frameB);

        const rightAfter = sprite.vertices[2];

        expect(rightAfter).toBeGreaterThan(rightBefore);

        sprite.destroy();
        frameA.destroy();
        frameB.destroy();
    });

    test('vertices recomputed after parent setPosition', () => {
        const parent = new Container();
        const sprite = new Sprite(makeTexture());

        parent.setPosition(0, 0);
        parent.addChild(sprite);
        sprite.setPosition(0, 0);

        const x0Before = sprite.vertices[0];

        parent.setPosition(100, 0);
        const x0After = sprite.vertices[0];

        expect(x0After).toBeCloseTo(x0Before + 100);

        parent.destroy();
    });
});

// ---------------------------------------------------------------------------
// Sprite normals caching
// ---------------------------------------------------------------------------

describe('Sprite.getNormals() — dirty-flag cache', () => {
    test('same Array reference and same Vector instances returned when nothing changed', () => {
        const sprite = new Sprite(makeTexture());

        sprite.setPosition(0, 0);

        const n1 = sprite.getNormals();
        const n2 = sprite.getNormals();

        expect(n1).toBe(n2);
        expect(n1[0]).toBe(n2[0]);
        expect(n1[1]).toBe(n2[1]);
        expect(n1[2]).toBe(n2[2]);
        expect(n1[3]).toBe(n2[3]);

        sprite.destroy();
    });

    test('normals recomputed after setRotation: x-normals change', () => {
        const sprite = new Sprite(makeTexture());

        sprite.setPosition(0, 0);
        sprite.setRotation(0);

        const n0x = sprite.getNormals()[0].x;
        const n0y = sprite.getNormals()[0].y;

        sprite.setRotation(90);

        const n0xAfter = sprite.getNormals()[0].x;
        const n0yAfter = sprite.getNormals()[0].y;

        // At 0° the top edge normal is (0,−1) or similar axis-aligned value.
        // At 90° it must differ.
        expect(
            Math.abs(n0xAfter - n0x) + Math.abs(n0yAfter - n0y)
        ).toBeGreaterThan(0.01);

        sprite.destroy();
    });

    test('normals stable array: values are updated in-place (same Vector objects)', () => {
        const sprite = new Sprite(makeTexture());

        sprite.setPosition(0, 0);
        sprite.setRotation(0);

        const normals = sprite.getNormals();
        const n0ref = normals[0];

        sprite.setRotation(45);

        // Read again — must update n0ref in place.
        sprite.getNormals();

        // The reference stored before the invalidation is the same object,
        // now holding the updated value.
        expect(sprite.getNormals()[0]).toBe(n0ref);

        sprite.destroy();
    });
});
