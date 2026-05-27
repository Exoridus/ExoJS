import { Drawable } from '@/rendering/Drawable';
import { Geometry } from '@/rendering/geometry/Geometry';
import { MeshMaterial } from '@/rendering/material/MeshMaterial';
import { ShaderSource } from '@/rendering/material/ShaderSource';
import { Mesh } from '@/rendering/mesh/Mesh';

const validVertices = (): Float32Array => new Float32Array([0, 0, 100, 0, 50, 100]);

const minimalGlsl = {
  vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
  fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
};

// Standard interleaved mesh layout: position f32x2 @0, texcoord f32x2 @8,
// color u8x4 @16, stride 20.
const createStandardGeometry = (): Geometry => {
  const stride = 20;
  const vertices = [
    { x: 0, y: 0, u: 0, v: 0, rgba: [255, 0, 0, 255] },
    { x: 10, y: 0, u: 1, v: 0, rgba: [0, 255, 0, 255] },
    { x: 5, y: 10, u: 0.5, v: 1, rgba: [0, 0, 255, 255] },
  ];
  const buffer = new ArrayBuffer(vertices.length * stride);
  const view = new DataView(buffer);

  vertices.forEach((vertex, index) => {
    const base = index * stride;
    view.setFloat32(base + 0, vertex.x, true);
    view.setFloat32(base + 4, vertex.y, true);
    view.setFloat32(base + 8, vertex.u, true);
    view.setFloat32(base + 12, vertex.v, true);
    view.setUint8(base + 16, vertex.rgba[0]);
    view.setUint8(base + 17, vertex.rgba[1]);
    view.setUint8(base + 18, vertex.rgba[2]);
    view.setUint8(base + 19, vertex.rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
  });
};

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
    expect(() => new Mesh({ vertices: new Float32Array([]) })).toThrow(/non-empty flat array/);
    expect(() => new Mesh({ vertices: new Float32Array([0, 0, 1]) })).toThrow(/non-empty flat array/);
  });

  test('rejects fewer than 3 vertices', () => {
    expect(() => new Mesh({ vertices: new Float32Array([0, 0, 1, 0]) })).toThrow(/at least 3 vertices/);
  });

  test('rejects mismatched uvs length', () => {
    expect(
      () =>
        new Mesh({
          vertices: validVertices(),
          uvs: new Float32Array([0, 0, 1, 0]),
        }),
    ).toThrow(/uvs length/);
  });

  test('rejects mismatched colors length', () => {
    expect(
      () =>
        new Mesh({
          vertices: validVertices(),
          colors: new Uint32Array([0xffffffff, 0xffffffff]),
        }),
    ).toThrow(/colors length/);
  });

  test('rejects index buffer not divisible by 3', () => {
    expect(
      () =>
        new Mesh({
          vertices: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          indices: new Uint16Array([0, 1, 2, 3]),
        }),
    ).toThrow(/multiple of 3/);
  });

  test('rejects out-of-range index', () => {
    expect(
      () =>
        new Mesh({
          vertices: validVertices(),
          indices: new Uint16Array([0, 1, 5]),
        }),
    ).toThrow(/out of range/);
  });

  test('rejects non-indexed mesh whose vertex count is not a multiple of 3', () => {
    expect(
      () =>
        new Mesh({
          vertices: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        }),
    ).toThrow(/multiple of 3/);
  });

  test('texture setter swaps the bound texture', () => {
    const mesh = new Mesh({ vertices: validVertices() });
    const fakeTexture = { width: 1, height: 1 } as unknown as NonNullable<Mesh['texture']>;

    mesh.texture = fakeTexture;
    expect(mesh.texture).toBe(fakeTexture);

    mesh.texture = null;
    expect(mesh.texture).toBeNull();
  });

  test('material and geometry are null by default', () => {
    const mesh = new Mesh({ vertices: validVertices() });
    expect(mesh.material).toBeNull();
    expect(mesh.geometry).toBeNull();
  });

  test('material instance is exposed on the mesh', () => {
    const material = new MeshMaterial({
      shader: new ShaderSource({ glsl: minimalGlsl }),
      uniforms: { uTime: 0 },
    });
    const mesh = new Mesh({ vertices: validVertices(), material });

    expect(mesh.material).toBe(material);
    expect(mesh.material?.shader.glsl?.vertex).toContain('#version 300 es');
    expect(mesh.material?.uniforms.uTime).toBe(0);
  });

  test('geometry form derives vertices, uvs, colors, and stores the geometry', () => {
    const geometry = createStandardGeometry();
    const mesh = new Mesh({ geometry });

    expect(mesh.geometry).toBe(geometry);
    expect(mesh.vertexCount).toBe(3);
    expect(Array.from(mesh.vertices)).toEqual([0, 0, 10, 0, 5, 10]);
    expect(mesh.uvs).not.toBeNull();
    expect(mesh.uvs?.[2]).toBeCloseTo(1);
    expect(mesh.uvs?.[4]).toBeCloseTo(0.5);
    // RGBA8 packed little-endian: R | G<<8 | B<<16 | A<<24.
    expect(mesh.colors?.[0]).toBe(0xff0000ff);
    expect(mesh.colors?.[1]).toBe(0xff00ff00);
    expect(mesh.colors?.[2]).toBe(0xffff0000);
  });

  test('geometry form carries an optional material', () => {
    const material = new MeshMaterial({ shader: new ShaderSource({ glsl: minimalGlsl }) });
    const mesh = new Mesh({ geometry: createStandardGeometry(), material });

    expect(mesh.material).toBe(material);
  });

  test('rejects supplying both vertices and geometry', () => {
    expect(() => new Mesh({ vertices: validVertices(), geometry: createStandardGeometry() })).toThrow(/either `vertices` or `geometry`/);
  });

  test('rejects supplying neither vertices nor geometry', () => {
    expect(() => new Mesh({})).toThrow(/either `vertices` or `geometry`/);
  });

  test('rejects non-triangle-list geometry', () => {
    const geometry = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 10, 0, 5, 10, 0, 0]),
      stride: 8,
      topology: 'triangle-strip',
    });

    expect(() => new Mesh({ geometry })).toThrow(/triangle-list/);
  });
});
