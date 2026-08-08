import { Geometry } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { assertVertexGeometryCompatible, ParticleBufferLayout } from '../src/renderModes/ParticleBufferLayout';

const attribute = (name: string, offset: number) => ({ name, size: 2, type: 'f32' as const, normalized: false, offset });

const triangleMesh = (): Geometry =>
  new Geometry({
    attributes: [attribute('a_meshPosition', 0)],
    vertexData: new Float32Array([0, 0, 1, 0, 0, 1]),
    stride: 8,
  });

describe('ParticleBufferLayout', () => {
  test('applies the documented defaults', () => {
    const layout = new ParticleBufferLayout({ attributes: [attribute('a_position', 0)], stride: 8 });

    expect(layout.usage).toBe('stream');
    expect(layout.topology).toBe('triangle-list');
    expect(layout.indices).toBeNull();
    expect(layout.indexCount).toBe(0);
  });

  test('accepts an attribute set with no position attribute', () => {
    // The reason this is not a Geometry: a per-instance record has no position
    // in the geometric sense, and Geometry would reject the layout outright.
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_scale', 0)], stride: 8 })).not.toThrow();
  });

  test('accepts indices with no vertex data to validate them against', () => {
    const layout = new ParticleBufferLayout({
      attributes: [attribute('a_position', 0)],
      stride: 8,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });

    expect(layout.indexCount).toBe(6);
  });

  test('copies the attribute objects it is handed', () => {
    const source = [attribute('a_position', 0)];
    const layout = new ParticleBufferLayout({ attributes: source, stride: 8 });

    expect(layout.attributes[0]).not.toBe(source[0]);
    expect(layout.attributes[0]).toEqual(source[0]);
  });

  test('rejects a non-positive stride', () => {
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_position', 0)], stride: 0 })).toThrow(/stride/i);
  });

  test('rejects an empty attribute list', () => {
    expect(() => new ParticleBufferLayout({ attributes: [], stride: 8 })).toThrow(/non-empty/i);
  });

  test('rejects a duplicate attribute name', () => {
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_position', 0), attribute('a_position', 8)], stride: 16 })).toThrow(
      /declared more than once/i,
    );
  });

  test('rejects overlapping attribute ranges', () => {
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_position', 0), attribute('a_scale', 4)], stride: 16 })).toThrow(/overlaps/i);
  });

  test('rejects an attribute reaching past the stride', () => {
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_position', 4)], stride: 8 })).toThrow(/exceeds stride/i);
  });

  test('rejects an unknown topology', () => {
    expect(() => new ParticleBufferLayout({ attributes: [attribute('a_position', 0)], stride: 8, topology: 'points' as never })).toThrow(/topology/i);
  });
});

describe('assertVertexGeometryCompatible', () => {
  const layout = new ParticleBufferLayout({ attributes: [attribute('a_position', 0)], stride: 8 });

  test('passes for an instanced mode with no name collision', () => {
    const mesh = triangleMesh();

    expect(() => assertVertexGeometryCompatible(layout, mesh, true, 'TestMode')).not.toThrow();

    mesh.destroy();
  });

  test('passes when there is no vertex geometry at all', () => {
    expect(() => assertVertexGeometryCompatible(layout, null, false, 'TestMode')).not.toThrow();
  });

  test('rejects a vertex geometry on a non-instanced mode', () => {
    const mesh = triangleMesh();

    expect(() => assertVertexGeometryCompatible(layout, mesh, false, 'TestMode')).toThrow(/instanced/i);

    mesh.destroy();
  });

  test('rejects an attribute name present in both buffers', () => {
    const colliding = new Geometry({
      attributes: [attribute('a_position', 0)],
      vertexData: new Float32Array([0, 0, 1, 0, 0, 1]),
      stride: 8,
    });

    expect(() => assertVertexGeometryCompatible(layout, colliding, true, 'TestMode')).toThrow(/a_position/);

    colliding.destroy();
  });
});
