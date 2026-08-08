import { Geometry } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { MeshParticles } from '../src/renderModes/MeshParticles';
import { QuadParticles } from '../src/renderModes/QuadParticles';

/** A right triangle with the right angle top-left, UVs spanning its bounds. */
const makeTriangle = (indexed = false): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_uv', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    // prettier-ignore
    vertexData: new Float32Array([
      -16, -16, 0, 0,
       16, -16, 1, 0,
      -16,  16, 0, 1,
    ]),
    stride: 16,
    indices: indexed ? new Uint16Array([0, 1, 2]) : null,
  });

const makeUntexturedTriangle = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([-4, -4, 4, -4, -4, 4]),
    stride: 8,
  });

const spawnParticles = (system: ParticleSystem, count: number): void => {
  for (let i = 0; i < count; i++) {
    const slot = system.spawn();

    system.posX[slot] = i * 10;
    system.posY[slot] = i * 20;
    system.scaleX[slot] = 1 + i;
    system.scaleY[slot] = 2 + i;
    system.rotations[slot] = i * 15;
    system.color[slot] = 0xff00ff00 + i;
    system.lifetime[slot] = 5;
  }
};

describe('MeshParticles', () => {
  it('declares an instanced, GPU-eligible mode carrying the mesh topology', () => {
    const mode = new MeshParticles({ geometry: makeTriangle() });

    expect(mode.instanced).toBe(true);
    expect(mode.gpuEligible).toBe(true);
    expect(mode.geometry.topology).toBe('triangle-list');
  });

  it('keeps the supplied geometry as its mesh and draws one instance of it', () => {
    const mesh = makeTriangle();
    const mode = new MeshParticles({ geometry: mesh });

    expect(mode.mesh).toBe(mesh);
    // Non-indexed: the draw covers the mesh's own vertices per instance.
    expect(mode.geometry.indices).toBeNull();
    expect(mode.geometry.indexCount).toBe(mesh.vertexCount);
  });

  it('adopts the mesh index buffer when it has one', () => {
    const mesh = makeTriangle(true);
    const mode = new MeshParticles({ geometry: mesh });

    expect(mode.geometry.indices).toBe(mesh.indices);
    expect(mode.geometry.indexCount).toBe(3);
  });

  it('declares the shared 40-byte per-instance layout rather than the mesh layout', () => {
    const mode = new MeshParticles({ geometry: makeTriangle() });

    expect(mode.geometry.stride).toBe(40);
    expect(mode.geometry.attributes.map(attribute => attribute.name)).toEqual(['a_position', 'a_scale', 'a_rotation', 'a_color', 'a_uvMin', 'a_uvMax']);
  });

  it('builds one 40-byte instance per live particle', () => {
    const system = new ParticleSystem({ capacity: 8 });
    const mode = new MeshParticles({ geometry: makeTriangle() });

    spawnParticles(system, 3);
    mode.build(system);

    expect(mode.count).toBe(3);
    expect(mode.data.byteLength).toBeGreaterThanOrEqual(3 * 40);

    const floats = new Float32Array(mode.data);

    // Instance 1 starts at float index 10 (40 bytes / 4).
    expect(floats[10]).toBe(10);
    expect(floats[11]).toBe(20);
  });

  it('packs the same per-instance bytes the quad mode packs', () => {
    const system = new ParticleSystem({ capacity: 8 });
    const mesh = new MeshParticles({ geometry: makeTriangle() });
    const quad = new QuadParticles();

    spawnParticles(system, 4);
    mesh.build(system);
    quad.build(system);

    expect(mesh.count).toBe(quad.count);
    // Byte-for-byte equality is what keeps this mode GPU-eligible: the compute
    // pipeline emits this layout and no other.
    expect(new Uint8Array(mesh.data, 0, mesh.count * 40)).toEqual(new Uint8Array(quad.data, 0, quad.count * 40));
  });

  it('reports zero instances for an empty system', () => {
    const mode = new MeshParticles({ geometry: makeTriangle() });

    mode.build(new ParticleSystem({ capacity: 8 }));

    expect(mode.count).toBe(0);
  });

  it('bakes the mesh vertices into both shader sources', () => {
    const mode = new MeshParticles({ geometry: makeTriangle() });
    const shader = mode.material.shader;

    expect(shader.glsl?.vertex).toContain('const vec4 c_meshVertices[3]');
    expect(shader.glsl?.vertex).toContain('vec4(16.0, -16.0, 1.0, 0.0)');
    expect(shader.wgsl).toContain('array<vec4<f32>, 3>');
    expect(shader.wgsl).toContain('vec4<f32>(16.0, -16.0, 1.0, 0.0)');
  });

  it('mixes the mesh UV across the particle frame rather than the whole texture', () => {
    const mode = new MeshParticles({ geometry: makeTriangle() });
    const shader = mode.material.shader;

    expect(shader.glsl?.vertex).toContain('mix(a_uvMin, a_uvMax, meshVertex.zw)');
    expect(shader.wgsl).toContain('mix(input.uvMin, input.uvMax, meshVertex.zw)');
  });

  it('bakes zero UVs for a mesh without a texcoord attribute', () => {
    const mode = new MeshParticles({ geometry: makeUntexturedTriangle() });

    // Every vertex carries UV (0, 0), so the mix collapses to uvMin and the
    // mesh samples one texel of its frame.
    expect(mode.material.shader.glsl?.vertex).toContain('vec4(-4.0, -4.0, 0.0, 0.0)');
    expect(mode.material.shader.glsl?.vertex).toContain('vec4(4.0, -4.0, 0.0, 0.0)');
  });
});
