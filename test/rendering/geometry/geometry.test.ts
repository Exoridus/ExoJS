import { Rectangle } from '@/math/Rectangle';
import { Geometry } from '@/rendering/geometry/Geometry';

import type { GeometryAttribute, GeometryOptions } from '@/rendering/geometry/GeometryAttribute';

const createAttributes = (): readonly GeometryAttribute[] => [
  { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
  { name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 8 },
];

const createVertexData = (): Float32Array =>
  new Float32Array([
    -10, -20, 0, 0,
    30, -20, 1, 0,
    30, 50, 1, 1,
    -10, 50, 0, 1,
  ]);

const createGeometry = (options: Partial<GeometryOptions> = {}): Geometry => {
  return new Geometry({
    attributes: createAttributes(),
    vertexData: createVertexData(),
    stride: 16,
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    ...options,
  });
};

describe('Geometry', () => {
  test('defaults usage to static', () => {
    const geometry = createGeometry();

    expect(geometry.usage).toBe('static');
  });

  test('defaults topology to triangle-list', () => {
    const geometry = createGeometry();

    expect(geometry.topology).toBe('triangle-list');
  });

  test('exposes vertexCount and indexCount', () => {
    const geometry = createGeometry();

    expect(geometry.vertexCount).toBe(4);
    expect(geometry.indexCount).toBe(6);
  });

  test('indexCount falls back to vertexCount for non-indexed geometry', () => {
    const geometry = createGeometry({ indices: null });

    expect(geometry.vertexCount).toBe(4);
    expect(geometry.indexCount).toBe(4);
  });

  test('id is stable per instance and unique between instances', () => {
    const a = createGeometry();
    const b = createGeometry();

    expect(a.id).toBe(a.id);
    expect(b.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  test('invalidate bumps version and marks bounds dirty', () => {
    const vertexData = createVertexData();
    const geometry = createGeometry({ vertexData });

    expect(geometry.version).toBe(0);

    vertexData[0] = -100;
    vertexData[1] = -200;

    geometry.invalidate();
    expect(geometry.version).toBe(1);

    const bounds = geometry.getLocalBounds();

    expect(bounds.left).toBe(-100);
    expect(bounds.top).toBe(-200);
  });

  test('local bounds are derived from the position attribute', () => {
    const geometry = createGeometry();
    const bounds = geometry.getLocalBounds();

    expect(bounds.left).toBe(-10);
    expect(bounds.top).toBe(-20);
    expect(bounds.right).toBe(30);
    expect(bounds.bottom).toBe(50);
  });

  test('recomputeLocalBounds reflects in-place vertex mutation', () => {
    const vertexData = createVertexData();
    const geometry = createGeometry({ vertexData });

    vertexData[8] = 100;
    vertexData[9] = -50;
    geometry.recomputeLocalBounds();

    const bounds = geometry.getLocalBounds();

    expect(bounds.right).toBe(100);
    expect(bounds.top).toBe(-50);
  });

  test('getLocalBounds(out) writes into out and returns it', () => {
    const geometry = createGeometry();
    const out = new Rectangle(1, 2, 3, 4);

    const result = geometry.getLocalBounds(out);

    expect(result).toBe(out);
    expect(out.left).toBe(-10);
    expect(out.top).toBe(-20);
    expect(out.right).toBe(30);
    expect(out.bottom).toBe(50);
    expect(geometry.getLocalBounds()).not.toBe(out);
  });

  test('rejects attribute ranges that exceed stride', () => {
    expect(() =>
      createGeometry({
        attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 12 }],
      }),
    ).toThrow(/exceeds stride/);
  });

  test('rejects layout without a position attribute', () => {
    expect(() =>
      createGeometry({
        attributes: [{ name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 0 }],
      }),
    ).toThrow(/requires a position attribute/);
  });

  test('destroy runs registered dispose callbacks once', () => {
    const geometry = createGeometry();
    const disposeA = vi.fn();
    const disposeB = vi.fn();

    geometry._onDispose(disposeA);
    geometry._onDispose(disposeB);

    geometry.destroy();
    geometry.destroy();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });
});
