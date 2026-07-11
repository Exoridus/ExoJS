/**
 * Cross-backend affine transform parity — packing and WGSL slot-math
 * convention pins for every WebGPU renderer stage.
 *
 * The per-node matrix travels through four structurally different packings
 * (shared TransformSlot storage, mat4x4 projection/group UBOs, mat3x3-std140
 * uniform blocks and the text renderer's FrameUniforms vec4 columns). All of
 * them must apply the SAME logical map as the WebGL2 backend's
 * `Matrix.toArray(false)` uploads and the canonical row-major convention
 * (`x' = a·x + b·y + tx`, see `src/rendering/affinePacking.ts`).
 *
 * A packing (or WGSL consumption) that transposes the linear part is
 * invisible for axis-aligned transforms (scale + translate) but diverges for
 * every rotated or skewed node — instanced vs. single-draw within WebGPU AND
 * WebGPU vs. WebGL2. These tests push a rotation+skew matrix through each
 * packing and require the canonical result (review finding F3/B-01: the
 * WebGPU instanced-mesh path applied the per-node affine transposed).
 */

import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { affineMat3Std140FloatCount, affineMat4FloatCount, packAffineMat3Std140, packAffineMat4 } from '#rendering/affinePacking';
import { TransformBuffer } from '#rendering/TransformBuffer';
import { instancedMeshShaderSource, WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { nineSliceShaderSource } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { geoPathEntries, shaderPathEntries } from '#rendering/webgpu/WebGpuRepeatingSpriteRenderer';
import { baseSpriteBatchTextureSlots, buildSpriteShaderSource } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { textShaderSource } from '#rendering/webgpu/WebGpuTextRenderer';

// ── Fixtures: asymmetric (rotation + skew) affine matrices ───────────────────
// Linear parts are deliberately non-symmetric (b ≠ c) so any transposed
// packing produces a different result. Constructor order: (a, b, x, c, d, y).

const nodeTransform = (): Matrix => new Matrix(0.86, -0.62, 13, 0.5, 1.14, -7);
const projectionTransform = (): Matrix => new Matrix(0.05, 0.01, -1, -0.02, -0.0625, 1);
const groupTransform = (): Matrix => new Matrix(0.94, -0.34, 5, 0.34, 0.94, -3);

const samplePoints: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [7, -3.5],
];

// Ground truth: the canonical row-major map (matches Matrix.combine/toArray
// and the WebGL2 vertex shaders).
const applyMatrix = (m: Matrix, x: number, y: number): readonly [number, number] => [m.a * x + m.b * y + m.x, m.c * x + m.d * y + m.y];

// Interpret 12 floats at `offset` as a WGSL mat3x3<f32> (std140, vec4-padded
// column-major) and apply it to (x, y, 1) — exactly what the GPU does.
const applyMat3Std140 = (data: Float32Array, offset: number, x: number, y: number): readonly [number, number] => [
  data[offset + 0]! * x + data[offset + 4]! * y + data[offset + 8]!,
  data[offset + 1]! * x + data[offset + 5]! * y + data[offset + 9]!,
];

// Interpret 16 floats at `offset` as a WGSL mat4x4<f32> (column-major) and
// apply it to (x, y, 0, 1).
const applyMat4 = (data: Float32Array, offset: number, x: number, y: number): readonly [number, number] => [
  data[offset + 0]! * x + data[offset + 4]! * y + data[offset + 12]!,
  data[offset + 1]! * x + data[offset + 5]! * y + data[offset + 13]!,
];

const expectPointsClose = (actual: readonly [number, number], expected: readonly [number, number]): void => {
  expect(actual[0]).toBeCloseTo(expected[0], 5);
  expect(actual[1]).toBeCloseTo(expected[1], 5);
};

describe('affine packing helpers', () => {
  test('packAffineMat3Std140 applies the canonical map', () => {
    const matrix = nodeTransform();
    const packed = packAffineMat3Std140(matrix, new Float32Array(affineMat3Std140FloatCount));

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat3Std140(packed, 0, x, y), applyMatrix(matrix, x, y));
    }
  });

  test('packAffineMat4 applies the canonical map', () => {
    const matrix = nodeTransform();
    const packed = packAffineMat4(matrix, new Float32Array(affineMat4FloatCount));

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat4(packed, 0, x, y), applyMatrix(matrix, x, y));
    }
  });

  test('packAffineMat3Std140 columns equal the WebGL2 Matrix.toArray(false) upload', () => {
    const matrix = nodeTransform();
    const packed = packAffineMat3Std140(matrix, new Float32Array(affineMat3Std140FloatCount));
    const gl = matrix.toArray(false);

    // Same column-major order, only vec4 padding differs.
    expect([packed[0], packed[1], packed[2]]).toEqual([gl[0], gl[1], gl[2]]);
    expect([packed[4], packed[5], packed[6]]).toEqual([gl[3], gl[4], gl[5]]);
    expect([packed[8], packed[9], packed[10]]).toEqual([gl[6], gl[7], gl[8]]);
  });

  test('helpers honor the offset parameter', () => {
    const matrix = groupTransform();
    const data = new Float32Array(affineMat3Std140FloatCount * 2);

    packAffineMat3Std140(matrix, data, affineMat3Std140FloatCount);

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat3Std140(data, affineMat3Std140FloatCount, x, y), applyMatrix(matrix, x, y));
    }
  });
});

describe('shared TransformSlot convention', () => {
  test('TransformBuffer slot layout + canonical WGSL slot math reproduce the node transform', () => {
    const matrix = nodeTransform();
    const buffer = new TransformBuffer();

    buffer.begin(1);
    buffer.write(0, matrix, new Color(255, 255, 255, 1));

    const slot = buffer.data;

    // Canonical WGSL consumption: m0 = (a, b, c, d), m1 = (tx, ty, 0, 0):
    //   worldX = m0.x·lx + m0.y·ly + m1.x
    //   worldY = m0.z·lx + m0.w·ly + m1.y
    for (const [x, y] of samplePoints) {
      const world: readonly [number, number] = [slot[0]! * x + slot[1]! * y + slot[4]!, slot[2]! * x + slot[3]! * y + slot[5]!];

      expectPointsClose(world, applyMatrix(matrix, x, y));
    }
  });
});

describe('WGSL slot math parity across instanced renderers', () => {
  // The canonical orientation, as WGSL source patterns. `lx` / `ly` are the
  // renderer-specific local-coordinate expressions (pre-escaped for regex).
  const canonicalWorldX = (lx: string, ly: string): RegExp =>
    new RegExp(String.raw`slot\.m0\.x\s*\*\s*${lx}\s*\+\s*slot\.m0\.y\s*\*\s*${ly}\s*\+\s*slot\.m1\.x`);
  const canonicalWorldY = (lx: string, ly: string): RegExp =>
    new RegExp(String.raw`slot\.m0\.z\s*\*\s*${lx}\s*\+\s*slot\.m0\.w\s*\*\s*${ly}\s*\+\s*slot\.m1\.y`);

  const cases: ReadonlyArray<{ name: string; source: string; lx: string; ly: string }> = [
    // The vertex stage (where the TransformSlot math lives) is identical
    // across the generated slot tiers; the base tier stands in for all.
    { name: 'sprite', source: buildSpriteShaderSource(baseSpriteBatchTextureSlots), lx: 'localX', ly: 'localY' },
    { name: 'nine-slice', source: nineSliceShaderSource, lx: 'localX', ly: 'localY' },
    { name: 'repeating-sprite (shader path)', source: shaderPathEntries, lx: 'lx', ly: 'ly' },
    { name: 'repeating-sprite (geometry path)', source: geoPathEntries, lx: 'lx', ly: 'ly' },
    { name: 'mesh (instanced path)', source: instancedMeshShaderSource, lx: String.raw`input\.position\.x`, ly: String.raw`input\.position\.y` },
  ];

  test.each(cases)('$name applies the shared TransformSlot in canonical orientation', ({ source, lx, ly }) => {
    expect(source).toMatch(canonicalWorldX(lx, ly));
    expect(source).toMatch(canonicalWorldY(lx, ly));
  });
});

describe('WGSL text transform construction', () => {
  test('text vertex shader reconstructs the node/proj/group mat3s in canonical column order', () => {
    // Node data rows are t0 = (a, c, e, tx), t1 = (b, d, f, ty) — i.e.
    // toArray(false) columns — so the mat3 columns must be built as
    // (t0.x, t0.y), (t1.x, t1.y), (t0.w, t1.w).
    expect(textShaderSource).toMatch(
      /mat3x3<f32>\(\s*vec3<f32>\(t0\.x,\s*t0\.y,\s*0\.0\),\s*vec3<f32>\(t1\.x,\s*t1\.y,\s*0\.0\),\s*vec3<f32>\(t0\.w,\s*t1\.w,\s*1\.0\),?\s*\)/,
    );

    // FrameUniforms carry projection/group as three vec4 columns each; the
    // shader must consume them as columns verbatim.
    expect(textShaderSource).toMatch(/mat3x3<f32>\(\s*frame\.projCol0\.xyz,\s*frame\.projCol1\.xyz,\s*frame\.projCol2\.xyz,?\s*\)/);
    expect(textShaderSource).toMatch(/mat3x3<f32>\(\s*frame\.groupCol0\.xyz,\s*frame\.groupCol1\.xyz,\s*frame\.groupCol2\.xyz,?\s*\)/);
  });
});

// ── Numeric parity for the mesh renderer's CPU-side uniform packings ─────────
//
// These drive the REAL private packing methods with a stub device that
// captures queue.writeBuffer, then interpret the captured bytes exactly as
// the WGSL struct declares them (mat3x3<f32> std140) and require the
// canonical map. A transposed packing fails here for the rotation+skew
// fixtures even though axis-aligned transforms would pass.

interface CapturedWrite {
  readonly floats: Float32Array;
}

const captureWriteBuffer = (): { writes: CapturedWrite[]; queue: { writeBuffer: (...args: unknown[]) => void } } => {
  const writes: CapturedWrite[] = [];

  return {
    writes,
    queue: {
      writeBuffer: (...args: unknown[]): void => {
        // Supports both writeBuffer(buffer, offset, data) and
        // writeBuffer(buffer, offset, data, dataOffset, size).
        const data = args[2] as ArrayBuffer | Float32Array;
        const buffer = data instanceof Float32Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
        const dataOffset = typeof args[3] === 'number' ? args[3] : 0;
        const size = typeof args[4] === 'number' ? args[4] : buffer.byteLength - dataOffset;

        writes.push({ floats: new Float32Array(buffer.slice(dataOffset, dataOffset + size)) });
      },
    },
  };
};

describe('WebGpuMeshRenderer uniform packing parity', () => {
  test('instanced uniform slot packs projection and group in canonical (non-transposed) column order', () => {
    const renderer = new WebGpuMeshRenderer();
    const capture = captureWriteBuffer();
    const projection = projectionTransform();
    const group = groupTransform();
    const internals = renderer as unknown as {
      _device: unknown;
      _instancedUniformBuffer: unknown;
      _writeInstancedUniformSlot(slot: number, backend: unknown, premultiplySample: boolean): void;
    };

    internals._device = { queue: capture.queue };
    internals._instancedUniformBuffer = {};
    internals._writeInstancedUniformSlot(
      0,
      {
        view: { getTransform: (): Matrix => projection },
        renderGroupTransform: group,
      },
      false,
    );

    expect(capture.writes).toHaveLength(1);

    // TransformUniforms layout: mat3x3 projection (floats 0..11),
    // mat3x3 group (floats 12..23), vec4 flags.
    const floats = capture.writes[0]!.floats;

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat3Std140(floats, 0, x, y), applyMatrix(projection, x, y));
      expectPointsClose(applyMat3Std140(floats, 12, x, y), applyMatrix(group, x, y));
    }
  });

  test('instanced uniform slot packs identity when no render group is active', () => {
    const renderer = new WebGpuMeshRenderer();
    const capture = captureWriteBuffer();
    const projection = projectionTransform();
    const internals = renderer as unknown as {
      _device: unknown;
      _instancedUniformBuffer: unknown;
      _writeInstancedUniformSlot(slot: number, backend: unknown, premultiplySample: boolean): void;
    };

    internals._device = { queue: capture.queue };
    internals._instancedUniformBuffer = {};
    internals._writeInstancedUniformSlot(
      0,
      {
        view: { getTransform: (): Matrix => projection },
        renderGroupTransform: null,
      },
      true,
    );

    const floats = capture.writes[0]!.floats;

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat3Std140(floats, 12, x, y), [x, y]);
    }

    // flags.x carries the premultiply toggle.
    expect(floats[24]).toBe(1);
  });

  test('custom-material mesh uniform packs projection and translation in canonical column order', () => {
    const renderer = new WebGpuMeshRenderer();
    const capture = captureWriteBuffer();
    const projection = projectionTransform();
    const node = nodeTransform();
    const internals = renderer as unknown as {
      _device: unknown;
      _writeCustomMeshUniform(material: unknown, resources: unknown, drawCursor: number, mesh: unknown, backend: unknown): void;
    };

    internals._device = { queue: capture.queue };
    internals._writeCustomMeshUniform(
      {},
      { meshUniformBuffer: {} },
      0,
      {
        getGlobalTransform: (): Matrix => node,
        tint: new Color(255, 255, 255, 1),
      },
      {
        view: { getTransform: (): Matrix => projection },
        renderGroupTransform: null,
      },
    );

    expect(capture.writes).toHaveLength(1);

    // MeshUniforms layout: mat3x3 projection (floats 0..11),
    // mat3x3 translation (floats 12..23), vec4 tint.
    const floats = capture.writes[0]!.floats;

    for (const [x, y] of samplePoints) {
      expectPointsClose(applyMat3Std140(floats, 0, x, y), applyMatrix(projection, x, y));
      expectPointsClose(applyMat3Std140(floats, 12, x, y), applyMatrix(node, x, y));
    }
  });
});
