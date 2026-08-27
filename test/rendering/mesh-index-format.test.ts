/**
 * The dual 16/32-bit mesh index path.
 *
 * A mesh used to be forced through 16-bit indices: `Geometry.indices` already
 * accepted a `Uint32Array` but `Mesh` narrowed it back, and a non-indexed mesh
 * was rejected outright past 65 536 vertices. That capped a single mesh at
 * roughly 21 800 triangles, which is fine for a hand-authored leaf and not fine
 * for generated or merged tile, trail, terrain or SVG geometry.
 *
 * These cells cover all seven paths a mesh's indices can reach the GPU through -
 * public types, explicit `Uint32` geometry, a large non-indexed mesh, immediate
 * `drawGeometry`, `drawBatch`, the static geometry cache (including a re-pack
 * after `Geometry.invalidate()`), and retained replay - and read back what each
 * backend was actually told: `UNSIGNED_INT` on WebGL2, `'uint32'` at a 4-aligned
 * offset on WebGPU.
 */

import { afterEach, describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { Mesh } from '#rendering/mesh/Mesh';
import { maxUint16VertexCount, meshIndexBytes, meshIndexFormatFor } from '#rendering/mesh/meshIndices';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { RetainedContainer } from '#rendering/RetainedContainer';

import { createWebGl2Harness, type WebGl2Harness } from '../perf/rendering/harness';
import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const GL_UNSIGNED_SHORT = 0x1403;
const GL_UNSIGNED_INT = 0x1405;

/** Interleaved position + texcoord + color, the layout the mesh renderers read. */
const vertexStride = 20;

interface Ctor {
  readonly triangles: number;
  readonly indices?: Uint16Array | Uint32Array | null;
  readonly usage?: 'static' | 'dynamic';
}

const buildGeometry = ({ triangles, indices = null, usage = 'static' }: Ctor): Geometry => {
  const vertexCount = indices === null ? triangles * 3 : Math.max(...indices) + 1;
  const buffer = new ArrayBuffer(vertexCount * vertexStride);
  const view = new DataView(buffer);

  for (let i = 0; i < vertexCount; i++) {
    const base = i * vertexStride;

    view.setFloat32(base, (i % 64) * 4, true);
    view.setFloat32(base + 4, Math.floor(i / 64) * 4, true);
    view.setFloat32(base + 8, 0, true);
    view.setFloat32(base + 12, 0, true);
    view.setUint32(base + 16, 0xffffffff, true);
  }

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride: vertexStride,
    indices,
    usage,
  });
};

interface RecordedElementDraw {
  readonly kind: 'draw' | 'instanced';
  readonly count: number;
  readonly indexType: number;
}

interface GlSpyHarness extends WebGl2Harness {
  readonly draws: RecordedElementDraw[];
}

const createGlSpyHarness = (): GlSpyHarness => {
  const harness = createWebGl2Harness({ width: 256, height: 256 });
  const draws: RecordedElementDraw[] = [];
  // The fake context is a Proxy with no `set` trap, so these land on its target
  // and every backend draw goes through the spies.
  const mutable = harness.context as unknown as Record<string, unknown>;

  mutable['drawElements'] = (_mode: number, count: number, indexType: number): void => {
    draws.push({ kind: 'draw', count, indexType });
  };
  mutable['drawElementsInstanced'] = (_mode: number, count: number, indexType: number): void => {
    draws.push({ kind: 'instanced', count, indexType });
  };

  return { ...harness, draws };
};

describe('mesh index width - public contract', () => {
  test('Mesh accepts and reports both index kinds', () => {
    const narrow = new Mesh({ vertices: new Float32Array(12), indices: new Uint16Array([0, 1, 2]) });
    const wide = new Mesh({ vertices: new Float32Array(12), indices: new Uint32Array([0, 1, 2]) });

    expect(narrow.indices).toBeInstanceOf(Uint16Array);
    expect(narrow.indexFormat).toBe('uint16');
    expect(wide.indices).toBeInstanceOf(Uint32Array);
    expect(wide.indexFormat).toBe('uint32');
  });

  test('an explicit Uint32 geometry is not narrowed back to 16 bits', () => {
    // The declared width is the contract. Narrowing a stream that happens to fit
    // would let the same geometry change index width when its content changes.
    const geometry = buildGeometry({ triangles: 1, indices: new Uint32Array([0, 1, 2]) });
    const mesh = new Mesh({ geometry });

    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.indexFormat).toBe('uint32');
  });

  test('meshIndexFormatFor follows the declaration for indexed and the count for non-indexed meshes', () => {
    expect(meshIndexFormatFor(new Uint16Array([0]), 3)).toBe('uint16');
    expect(meshIndexFormatFor(new Uint32Array([0]), 3)).toBe('uint32');
    expect(meshIndexFormatFor(null, maxUint16VertexCount)).toBe('uint16');
    expect(meshIndexFormatFor(null, maxUint16VertexCount + 1)).toBe('uint32');
    expect(meshIndexBytes('uint16')).toBe(2);
    expect(meshIndexBytes('uint32')).toBe(4);
  });

  test('index bounds are still validated at the wider width', () => {
    expect(() => new Mesh({ vertices: new Float32Array(12), indices: new Uint32Array([0, 1, 9]) })).toThrow(/out of range/);
  });
});

describe('WebGL2 mesh index width', () => {
  let harness: GlSpyHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('a 16-bit mesh still draws with UNSIGNED_SHORT', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);

    context.drawGeometry(buildGeometry({ triangles: 2, indices: new Uint16Array([0, 1, 2, 3, 4, 5]) }), new Matrix());
    harness.backend.flush();

    expect(harness.draws).toHaveLength(1);
    expect(harness.draws[0]?.indexType).toBe(GL_UNSIGNED_SHORT);
  });

  test('drawGeometry with a 32-bit stream draws with UNSIGNED_INT', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);

    context.drawGeometry(buildGeometry({ triangles: 2, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }), new Matrix());
    harness.backend.flush();

    expect(harness.draws).toHaveLength(1);
    expect(harness.draws[0]).toMatchObject({ count: 6, indexType: GL_UNSIGNED_INT });
  });

  test('mixing widths in one frame draws each with its own element type', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);

    context.drawGeometry(buildGeometry({ triangles: 1, indices: new Uint16Array([0, 1, 2]) }), new Matrix());
    context.drawGeometry(buildGeometry({ triangles: 1, indices: new Uint32Array([0, 1, 2]) }), new Matrix());
    context.drawGeometry(buildGeometry({ triangles: 1, indices: new Uint16Array([0, 1, 2]) }), new Matrix());
    harness.backend.flush();

    expect(harness.draws.map(({ indexType }) => indexType)).toEqual([GL_UNSIGNED_SHORT, GL_UNSIGNED_INT, GL_UNSIGNED_SHORT]);
  });

  test('drawBatch draws its shared 32-bit geometry with UNSIGNED_INT', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);
    const batch = new RenderBatch(buildGeometry({ triangles: 2, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }));

    batch.add(new Matrix(), Color.white);
    batch.add(new Matrix(), Color.white);
    context.drawBatch(batch);
    harness.backend.flush();

    expect(harness.draws).toHaveLength(1);
    expect(harness.draws[0]).toMatchObject({ kind: 'instanced', count: 6, indexType: GL_UNSIGNED_INT });
  });

  test('a scene mesh on cached static geometry keeps the width across a re-pack', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);
    const geometry = buildGeometry({ triangles: 2, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) });
    const mesh = new Mesh({ geometry, texture: null });

    context.render(mesh);
    harness.backend.flush();
    expect(harness.draws.at(-1)?.indexType).toBe(GL_UNSIGNED_INT);

    // The cached entry is re-packed on a version bump, and every VAO already
    // built against it has to keep drawing at the packed width.
    harness.draws.length = 0;
    geometry.invalidate();
    context.render(mesh);
    harness.backend.flush();

    expect(harness.draws.at(-1)?.indexType).toBe(GL_UNSIGNED_INT);
  });

  test('retained replay draws the recorded geometry at its recorded width', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);
    const group = new RetainedContainer();

    group.addChild(new Mesh({ geometry: buildGeometry({ triangles: 2, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }), texture: null }));

    // First frames record the fragment; a later frame replays it.
    for (let frame = 0; frame < 4; frame++) {
      context.render(group);
      harness.backend.flush();
    }

    harness.draws.length = 0;
    context.render(group);
    harness.backend.flush();

    expect(harness.draws.length).toBeGreaterThan(0);

    for (const draw of harness.draws) {
      expect(draw.indexType).toBe(GL_UNSIGNED_INT);
    }
  });

  test('a large non-indexed mesh reaches the GPU instead of throwing', () => {
    harness = createGlSpyHarness();

    const context = new RenderingContext(harness.backend);
    // A non-indexed triangle list needs a multiple of 3; 65 538 is the first one
    // past what a 16-bit index can address.
    const vertexCount = maxUint16VertexCount + 2;
    const geometry = buildGeometry({ triangles: vertexCount / 3 });

    expect(new Mesh({ geometry }).indexFormat).toBe('uint32');

    context.drawGeometry(geometry, new Matrix());
    harness.backend.flush();

    expect(harness.draws).toHaveLength(1);
    expect(harness.draws[0]).toMatchObject({ count: vertexCount, indexType: GL_UNSIGNED_INT });
  });
});

describe('WebGPU mesh index width', () => {
  test('a 32-bit mesh binds uint32 at a 4-aligned offset, and widths may mix in one flush', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const texture = createCanvasTexture();

      // Three indices is an odd uint16 block: without the shared 4-byte
      // alignment the uint32 draw behind it would land on a 2-byte boundary,
      // which `setIndexBuffer` rejects for that format.
      context.drawGeometry(buildGeometry({ triangles: 1, indices: new Uint16Array([0, 1, 2]) }), new Matrix());
      context.drawGeometry(buildGeometry({ triangles: 1, indices: new Uint32Array([0, 1, 2]) }), new Matrix());
      backend.flush();

      const bindings = environment.indexBufferBindings();

      expect(bindings.map(({ format }) => format)).toEqual(['uint16', 'uint32']);

      for (const { format, offset } of bindings) {
        expect(offset % meshIndexBytes(format as 'uint16' | 'uint32')).toBe(0);
      }

      texture.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('drawBatch binds the cached static geometry at its own width', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const batch = new RenderBatch(buildGeometry({ triangles: 2, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }));

      batch.add(new Matrix(), Color.white);
      batch.add(new Matrix(), Color.white);
      context.drawBatch(batch);
      backend.flush();

      expect(environment.indexBufferBindings().map(({ format }) => format)).toEqual(['uint32']);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
