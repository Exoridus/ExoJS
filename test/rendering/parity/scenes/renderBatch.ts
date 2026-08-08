/**
 * Explicit instanced-batch scenes.
 *
 * Every other scene here renders scene-graph nodes. `RenderingContext.drawBatch`
 * is an immediate call instead, so these scenes wrap it in a node that issues the
 * batch during its own render — that is what lets the same runner compare it
 * across backends.
 *
 * The custom-material scene is the one that earns its place: the two backends
 * reach a batch's transform and tint through entirely different machinery — a
 * `sampler2D` fetched with `texelFetch` on WebGL2, a `read-only-storage` array on
 * WebGPU — and `INSTANCE_TRANSFORM_GLSL` / `INSTANCE_TRANSFORM_WGSL` are two
 * hand-written encodings of the same contract. Nothing else checks that those two
 * agree. A divergence in the snap policy, the affine unpacking or the tint
 * unpacking shows up here as a cross-backend pixel difference and nowhere else.
 */

import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { INSTANCE_TRANSFORM_GLSL, INSTANCE_TRANSFORM_WGSL } from '#rendering/shader/instanceContract';

import type { Scene } from '../types';

const CANVAS = 64;
const QUAD = 16;

/**
 * Emits one {@link RenderBatch} during its own render pass.
 *
 * The `RenderingContext` is built per render rather than cached: the runner
 * renders a freshly built scene against a freshly initialised backend, and a
 * context outliving its backend would hold a dead reference.
 */
class BatchNode extends Container {
  public constructor(private readonly _batch: RenderBatch) {
    super();
  }

  public override render(backend: RenderBackend): this {
    super.render(backend);

    const context = new RenderingContext(backend);

    try {
      context.drawBatch(this._batch);
    } finally {
      context.destroy();
    }

    return this;
  }
}

/** A white unit quad at the local origin; per-instance tints supply all colour. */
const quadGeometry = (): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [QUAD, 0],
    [QUAD, QUAD],
    [0, 0],
    [QUAD, QUAD],
    [0, QUAD],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, 255);
    view.setUint8(base + 9, 255);
    view.setUint8(base + 10, 255);
    view.setUint8(base + 11, 255);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: buffer,
    stride,
  });
};

const contractMaterial = (): MeshMaterial =>
  new MeshMaterial({
    shader: new ShaderSource({
      glsl: {
        vertex: `#version 300 es
${INSTANCE_TRANSFORM_GLSL}

in vec2 a_offset;

out vec4 v_tint;

void main() {
  gl_Position = vec4(exoInstanceClipPosition(a_position + a_offset, a_nodeIndex), 0.0, 1.0);
  v_tint = exoInstanceTint(a_nodeIndex);
}`,
        fragment: `#version 300 es
precision mediump float;

in vec4 v_tint;

out vec4 fragColor;

void main() {
  fragColor = vec4(v_tint.rgb * v_tint.a, v_tint.a);
}`,
      },
      wgsl: `${INSTANCE_TRANSFORM_WGSL}

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(6) nodeIndex: u32,
    @location(7) offset: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) tint: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(exoInstanceClipPosition(input.position + input.offset, input.nodeIndex), 0.0, 1.0);
    output.tint = exoInstanceTint(input.nodeIndex);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.tint.rgb * input.tint.a, input.tint.a);
}`,
    }),
  });

const defaultMaterialBatch = (): Container => {
  const batch = new RenderBatch(quadGeometry())
    .add(new Matrix(1, 0, 4, 0, 1, 4), new Color(255, 0, 0))
    .add(new Matrix(1, 0, 40, 0, 1, 4), new Color(0, 255, 0))
    .add(new Matrix(1, 0, 4, 0, 1, 40), new Color(0, 0, 255))
    // A non-identity linear part, so a backend that only ever applied the
    // translation columns of the shared transform row would still differ here.
    .add(new Matrix(1.5, 0, 34, 0, 0.5, 44), new Color(255, 255, 0));

  return new BatchNode(batch);
};

const customMaterialBatch = (): Container => {
  const batch = new RenderBatch(quadGeometry(), contractMaterial(), {
    instanceAttributes: [{ name: 'a_offset', format: 'float32x2' }],
  });
  const data = { a_offset: [0, 0] };

  // Identical transforms throughout: every instance is separated purely by its
  // free attribute, so the divisor-1 stream is what the comparison is about.
  data.a_offset[0] = 4;
  data.a_offset[1] = 4;
  batch.add(new Matrix(), new Color(255, 0, 0), data);
  data.a_offset[0] = 40;
  data.a_offset[1] = 4;
  batch.add(new Matrix(), new Color(0, 255, 0), data);
  data.a_offset[0] = 4;
  data.a_offset[1] = 40;
  batch.add(new Matrix(), new Color(0, 128, 255), data);

  return new BatchNode(batch);
};

export const renderBatchScenes: readonly Scene[] = [
  {
    name: 'render-batch/default-material',
    feature: 'RenderBatch',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: true,
    build: defaultMaterialBatch,
  },
  {
    name: 'render-batch/custom-material-instance-attributes',
    feature: 'RenderBatch',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: true,
    build: customMaterialBatch,
  },
];
