import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { RenderBatch } from '#rendering/RenderBatch';

const triangleGeometry = (usage: 'static' | 'dynamic' | 'stream' = 'static'): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 10, 0, 5, 10]),
    stride: 8,
    usage,
  });

describe('RenderBatch', () => {
  test('starts empty and exposes its geometry/material', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);

    expect(batch.count).toBe(0);
    expect(batch.geometry).toBe(geometry);
    expect(batch.material).toBeNull();

    geometry.destroy();
  });

  test('add increments count', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);

    batch.add(new Matrix()).add(new Matrix());

    expect(batch.count).toBe(2);

    batch.destroy();
    geometry.destroy();
  });

  test('add copies the transform (mutating the source afterwards does not affect the batch)', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);
    const transform = new Matrix(2, 0, 5, 0, 3, 7);

    batch.add(transform);
    // Mutate the source matrix; the batch must keep the copied values.
    transform.set(9, 9, 9, 9, 9, 9);

    const stored = batch._instanceTransforms[0];

    expect(stored.a).toBe(2);
    expect(stored.d).toBe(3);
    expect(stored.x).toBe(5);
    expect(stored.y).toBe(7);

    batch.destroy();
    geometry.destroy();
  });

  test('add copies the tint and defaults to white', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);

    batch.add(new Matrix(), new Color(255, 0, 0));
    batch.add(new Matrix());

    expect(batch._instanceTints[0].equals(new Color(255, 0, 0))).toBe(true);
    expect(batch._instanceTints[1].equals(Color.white)).toBe(true);

    batch.destroy();
    geometry.destroy();
  });

  test('clear resets the count but retains pooled storage', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);

    batch.add(new Matrix()).add(new Matrix());
    const pooledMatrix = batch._instanceTransforms[0];

    batch.clear();
    expect(batch.count).toBe(0);

    // Re-adding reuses the same pooled Matrix instance (no reallocation).
    batch.add(new Matrix(4, 0, 0, 0, 4, 0));
    expect(batch._instanceTransforms[0]).toBe(pooledMatrix);
    expect(batch.count).toBe(1);
    expect(batch._instanceTransforms[0].a).toBe(4);

    batch.destroy();
    geometry.destroy();
  });

  test.each(['static', 'dynamic', 'stream'] as const)('accepts %s geometry', (usage) => {
    const geometry = triangleGeometry(usage);
    const batch = new RenderBatch(geometry);

    expect(batch.geometry).toBe(geometry);

    batch.destroy();
    geometry.destroy();
  });

  test('rejects a material that does not target mesh', () => {
    const geometry = triangleGeometry();
    const spriteMaterial = { target: 'sprite' } as unknown as MeshMaterial;

    expect(() => new RenderBatch(geometry, spriteMaterial)).toThrow(/must target 'mesh'/);

    geometry.destroy();
  });

  test('interleaves declared instance attributes in declaration order', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry, null, {
      instanceAttributes: [
        { name: 'a_offset', format: 'float32x2' },
        { name: 'a_rotation', format: 'float32' },
      ],
    });

    batch.add(new Matrix(), null, { a_offset: [1, 2], a_rotation: 3 });
    batch.add(new Matrix(), null, { a_offset: [4, 5], a_rotation: 6 });

    const view = batch._instanceView!;

    expect(view.strideFloats).toBe(3);
    expect(view.layoutKey).toBe('a_offset:2,a_rotation:1');
    expect([...view.data.subarray(0, 6)]).toEqual([1, 2, 3, 4, 5, 6]);

    batch.destroy();
    geometry.destroy();
  });

  test('exposes no instance view when no attributes are declared', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry);

    batch.add(new Matrix());

    expect(batch._instanceView).toBeNull();

    batch.destroy();
    geometry.destroy();
  });

  test('keeps the instance view identity stable as storage grows', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry, null, { instanceAttributes: [{ name: 'a_value', format: 'float32' }] });
    const first = batch._instanceView;

    for (let i = 0; i < 64; i++) {
      batch.add(new Matrix(), null, { a_value: i });
    }

    // Reading the view every frame must not allocate, so the object is cached
    // and only its `data` reference is re-pointed when the storage doubles.
    expect(batch._instanceView).toBe(first);
    expect(batch._instanceView!.data[63]).toBe(63);

    batch.destroy();
    geometry.destroy();
  });

  test('rejects instance data that does not match the declared layout', () => {
    const geometry = triangleGeometry();
    const batch = new RenderBatch(geometry, null, { instanceAttributes: [{ name: 'a_offset', format: 'float32x2' }] });

    expect(() => batch.add(new Matrix())).toThrow(/requires instance data/);
    expect(() => batch.add(new Matrix(), null, { a_other: [1, 2] })).toThrow(/missing instance attribute 'a_offset'/);
    expect(() => batch.add(new Matrix(), null, { a_offset: [1, 2, 3] })).toThrow(/expects 2 components \(got 3\)/);
    expect(() => batch.add(new Matrix(), null, { a_offset: 1 })).toThrow(/expects 2 components \(got a single number\)/);

    batch.destroy();
    geometry.destroy();
  });

  test('rejects a duplicate instance attribute name', () => {
    const geometry = triangleGeometry();

    expect(
      () =>
        new RenderBatch(geometry, null, {
          instanceAttributes: [
            { name: 'a_offset', format: 'float32x2' },
            { name: 'a_offset', format: 'float32' },
          ],
        }),
    ).toThrow(/declared more than once/);

    geometry.destroy();
  });

  test('accepts a mesh material', () => {
    const geometry = triangleGeometry();
    const material = new MeshMaterial({
      shader: new ShaderSource({
        glsl: {
          vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
          fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
        },
      }),
    });
    const batch = new RenderBatch(geometry, material);

    expect(batch.material).toBe(material);

    material.destroy();
    geometry.destroy();
  });
});
