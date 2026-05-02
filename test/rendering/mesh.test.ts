import { Mesh } from '@/rendering/mesh/Mesh';
import { Drawable } from '@/rendering/Drawable';

const validVertices = (): Float32Array => new Float32Array([0, 0, 100, 0, 50, 100]);

describe('Mesh', () => {
    test('extends Drawable', () => {
        const mesh = new Mesh({ vertices: validVertices() });

        expect(mesh).toBeInstanceOf(Drawable);
    });

    test('exposes vertex count and default index count', () => {
        const mesh = new Mesh({ vertices: validVertices() });

        expect(mesh.vertexCount).toBe(3);
        expect(mesh.indexCount).toBe(3);
        expect(mesh.indices).toBeNull();
        expect(mesh.uvs).toBeNull();
        expect(mesh.colors).toBeNull();
        expect(mesh.texture).toBeNull();
    });

    test('honors explicit indices for indexCount', () => {
        const mesh = new Mesh({
            vertices: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        });

        expect(mesh.vertexCount).toBe(4);
        expect(mesh.indexCount).toBe(6);
    });

    test('local bounds are the AABB of the vertex stream', () => {
        const mesh = new Mesh({
            vertices: new Float32Array([-10, -20, 30, -20, 30, 50, -10, 50]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        });
        const bounds = mesh.getLocalBounds();

        expect(bounds.left).toBe(-10);
        expect(bounds.top).toBe(-20);
        expect(bounds.right).toBe(30);
        expect(bounds.bottom).toBe(50);
    });

    test('recomputeLocalBounds picks up in-place vertex mutation', () => {
        const vertices = new Float32Array([0, 0, 10, 0, 5, 10]);
        const mesh = new Mesh({ vertices });

        vertices[2] = 100;
        vertices[3] = -50;
        mesh.recomputeLocalBounds();

        const bounds = mesh.getLocalBounds();

        expect(bounds.right).toBe(100);
        expect(bounds.top).toBe(-50);
    });

    test('rejects an empty or odd-length vertex stream', () => {
        expect(() => new Mesh({ vertices: new Float32Array([]) }))
            .toThrow(/non-empty flat array/);
        expect(() => new Mesh({ vertices: new Float32Array([0, 0, 1]) }))
            .toThrow(/non-empty flat array/);
    });

    test('rejects fewer than 3 vertices', () => {
        expect(() => new Mesh({ vertices: new Float32Array([0, 0, 1, 0]) }))
            .toThrow(/at least 3 vertices/);
    });

    test('rejects mismatched uvs length', () => {
        expect(() => new Mesh({
            vertices: validVertices(),
            uvs: new Float32Array([0, 0, 1, 0]),
        })).toThrow(/uvs length/);
    });

    test('rejects mismatched colors length', () => {
        expect(() => new Mesh({
            vertices: validVertices(),
            colors: new Uint32Array([0xffffffff, 0xffffffff]),
        })).toThrow(/colors length/);
    });

    test('rejects index buffer not divisible by 3', () => {
        expect(() => new Mesh({
            vertices: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint16Array([0, 1, 2, 3]),
        })).toThrow(/multiple of 3/);
    });

    test('rejects out-of-range index', () => {
        expect(() => new Mesh({
            vertices: validVertices(),
            indices: new Uint16Array([0, 1, 5]),
        })).toThrow(/out of range/);
    });

    test('rejects non-indexed mesh whose vertex count is not a multiple of 3', () => {
        expect(() => new Mesh({
            vertices: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        })).toThrow(/multiple of 3/);
    });

    test('texture setter swaps the bound texture', () => {
        const mesh = new Mesh({ vertices: validVertices() });
        const fakeTexture = { width: 1, height: 1 } as unknown as NonNullable<Mesh['texture']>;

        mesh.texture = fakeTexture;
        expect(mesh.texture).toBe(fakeTexture);

        mesh.texture = null;
        expect(mesh.texture).toBeNull();
    });
});
