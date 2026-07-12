/**
 * WebGL2 rotated-mesh browser tests — instanced vs. single-draw parity,
 * mirroring webgpu-rotated-mesh.test.ts 1:1 (review finding F3/B-01
 * cross-backend gate).
 *
 * The WebGPU instanced-mesh path used to apply the per-node affine
 * transposed; WebGL2 is the ground truth. Both files assert the SAME
 * expected pixels for the same rotated quads through drawGeometry (single)
 * and drawBatch (instanced), so a divergence on either backend fails its
 * suite.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`, and `WebGl2Backend#initialize` connects the renderer
// registry eagerly, so every registered renderer's program needs valid GLSL.
// The mesh sources are the REAL production sources (pinned attribute
// locations, shared TransformBuffer fetch, canonical column order) — this
// file exists to pin exactly that transform math.
// ---------------------------------------------------------------------------

const shaderSources = vi.hoisted(() => ({
  spriteVert: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
flat out uint v_textureSlot;
void main() {
  vec2 local;
  if (gl_VertexID == 0) local = vec2(a_localBounds.x, a_localBounds.y);
  else if (gl_VertexID == 1) local = vec2(a_localBounds.z, a_localBounds.y);
  else if (gl_VertexID == 2) local = vec2(a_localBounds.x, a_localBounds.w);
  else local = vec2(a_localBounds.z, a_localBounds.w);
  vec2 uv;
  if (gl_VertexID == 0) uv = vec2(a_uvBounds.x, a_uvBounds.y);
  else if (gl_VertexID == 1) uv = vec2(a_uvBounds.z, a_uvBounds.y);
  else if (gl_VertexID == 2) uv = vec2(a_uvBounds.x, a_uvBounds.w);
  else uv = vec2(a_uvBounds.z, a_uvBounds.w);
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  vec2 world = vec2(m0.x * local.x + m0.y * local.y + m1.x, m0.z * local.x + m0.w * local.y + m1.y);
  vec3 clip = u_projection * u_group * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv; v_color = texelFetch(u_transforms, ivec2(2, int(a_nodeIndex)), 0); v_textureSlot = a_textureSlot;
}`,

  // Real production mesh.vert (canonical TransformSlot column order).
  meshVert: `#version 300 es
precision lowp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;

out vec2 v_texcoord;
out vec4 v_color;
out vec4 v_tint;

void main(void) {
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
    mat3 transform = mat3(
        m0.x, m0.z, 0.0,
        m0.y, m0.w, 0.0,
        m1.x, m1.y, 1.0
    );

    gl_Position = vec4((u_projection * u_group * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
    v_texcoord = a_texcoord;
    v_color = a_color;
    v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  // Real production mesh.frag.
  meshFrag: `#version 300 es
precision lowp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;
in vec4 v_tint;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 base = texture(u_texture, v_texcoord) * v_color * v_tint;
    fragColor = vec4(base.rgb * base.a, base.a);
}`,

  textVert: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
uniform mat3 u_projection;
uniform mat3 u_group;
out vec2 v_uv;
void main() {
  float ni = a_nodeIndex;
  vec3 clip = u_projection * u_group * vec3(a_position + vec2(ni * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0); v_uv = a_texcoord;
}`,

  textFrag: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv); }`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVert }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('./_spriteFragMock')).createSpriteFragMockSource('v_uv') }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVert }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFrag }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVert }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFrag }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFrag }));

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

// Rotation +90° in the engine's row-major convention (a=cosθ, b=-sinθ,
// c=sinθ, d=cosθ): (x, y) → (tx - y, ty + x).
const rotatePlus90 = (tx: number, ty: number): Matrix => new Matrix(0, -1, tx, 1, 0, ty);
// Rotation -90°: (x, y) → (tx + y, ty - x).
const rotateMinus90 = (tx: number, ty: number): Matrix => new Matrix(0, 1, tx, -1, 0, ty);

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

// A solid-color quad (two triangles) in local space. Layout: position f32x2
// @0, color u8x4-norm @8, stride 12 — the default mesh path samples the 1×1
// white texture, so the output is the vertex color.
const coloredQuad = (x0: number, y0: number, x1: number, y1: number, rgba: RgbaTuple): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, rgba[0]);
    view.setUint8(base + 9, rgba[1]);
    view.setUint8(base + 10, rgba[2]);
    view.setUint8(base + 11, rgba[3]);
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

// A screen-space view matching the canvas: world (0,0)..(64,64) maps to the
// whole surface, top-left origin.
const screenView = (): View => new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 6): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGL2 rotated mesh: single-draw vs. instanced parity', () => {
  test('single draw renders a +90° rotated quad at the canonical world position', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // (0..16)² rotated +90° about the origin, translated to (32, 8):
      // covers x∈(16,32), y∈(8,24).
      context.drawGeometry(geometry, rotatePlus90(32, 8), { view: screenView() });

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readPixel(backend, 24, 16), [255, 0, 0, 255]); // rotated quad center
      expectPixelNear(readPixel(backend, 40, 4), [0, 0, 0, 255]); // transposed-artifact region stays empty
      expectPixelNear(readPixel(backend, 48, 48), [0, 0, 0, 255]); // unrelated region
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('instanced batch renders rotated instances at the same positions as single draws', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(rotatePlus90(32, 8), new Color(255, 0, 0)) // x∈(16,32), y∈(8,24)
      .add(rotateMinus90(16, 40), new Color(0, 255, 0)) // x∈(16,32), y∈(24,40)
      .add(new Matrix(1, 0, 40, 0, 1, 40), new Color(0, 0, 255)); // x∈(40,56), y∈(40,56)

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // All three instances are emitted as one instanced draw call.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readPixel(backend, 24, 16), [255, 0, 0, 255]); // +90° instance center
      expectPixelNear(readPixel(backend, 24, 32), [0, 255, 0, 255]); // -90° instance center
      expectPixelNear(readPixel(backend, 48, 48), [0, 0, 255, 255]); // identity instance center
      expectPixelNear(readPixel(backend, 40, 4), [0, 0, 0, 255]); // transposed +90° artifact region
      expectPixelNear(readPixel(backend, 8, 48), [0, 0, 0, 255]); // transposed -90° artifact region
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('a one-instance batch matches the single-draw output exactly', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 0, 0, 255]);
    const batch = new RenderBatch(geometry).add(rotatePlus90(32, 8), new Color(255, 255, 255));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // Same expectations as the single-draw cell above.
      expectPixelNear(readPixel(backend, 24, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 4), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 48, 48), [0, 0, 0, 255]);
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
