/**
 * WebGL2 immediate-draw browser tests — opt-in, capability-aware.
 *
 * Exercises {@link RenderingContext.drawGeometry}: a node-free immediate draw of
 * a {@link Geometry} through the pooled mesh path and the synthetic (non-plan)
 * instanced transform seam (`_drawDynamicInstancedSingle` with a null command →
 * `_writeTransformCommand`). Confirms the geometry renders at its world
 * position, the raw transform is applied verbatim, and a tint modulates color.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderingContext } from '#rendering/RenderingContext';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the renderers compile on connect must be mocked with
// valid sources. The mesh sources keep the REAL pinned attribute locations
// (0/1/2/6) and the shared TransformBuffer fetch so the synthetic transform path
// renders correctly.
const shaderSources = vi.hoisted(() => ({
  spriteVertexSource: `#version 300 es
precision mediump float;
in vec4 a_localBounds;
in vec4 a_uvBounds;
in vec4 a_color;
in uint a_textureSlot;
in uint a_nodeIndex;
uniform mat3 u_projection;
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
  vec3 clip = u_projection * vec3(world, 1.0);

  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = uv;
  v_color = a_color;
  v_textureSlot = a_textureSlot;
}`,

  spriteFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
flat in uint v_textureSlot;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;
uniform sampler2D u_texture3;
uniform sampler2D u_texture4;
uniform sampler2D u_texture5;
uniform sampler2D u_texture6;
uniform sampler2D u_texture7;
out vec4 outColor;
vec4 sampleTexture(uint slot, vec2 uv) {
  if (slot == uint(0)) return texture(u_texture0, uv);
  if (slot == uint(1)) return texture(u_texture1, uv);
  if (slot == uint(2)) return texture(u_texture2, uv);
  if (slot == uint(3)) return texture(u_texture3, uv);
  if (slot == uint(4)) return texture(u_texture4, uv);
  if (slot == uint(5)) return texture(u_texture5, uv);
  if (slot == uint(6)) return texture(u_texture6, uv);
  return texture(u_texture7, uv);
}
void main() {
  outColor = sampleTexture(v_textureSlot, v_uv) * v_color;
}`,

  meshVertexSource: `#version 300 es
precision lowp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
layout(location = 6) in uint a_nodeIndex;
uniform mat3 u_projection;
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
  gl_Position = vec4((u_projection * transform * vec3(a_position, 1.0)).xy, 0.0, 1.0);
  v_texcoord = a_texcoord;
  v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFragmentSource: `#version 300 es
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

  particleVertexSource: `#version 300 es
precision mediump float;
in vec2 a_translation;
in vec2 a_scale;
in float a_rotation;
in vec4 a_color;
in vec2 a_uvMin;
in vec2 a_uvMax;
uniform mat3 u_projection;
uniform mat3 u_systemTransform;
uniform vec4 u_localBounds;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 corner;
  if (gl_VertexID == 0) corner = vec2(0.0, 0.0);
  else if (gl_VertexID == 1) corner = vec2(1.0, 0.0);
  else if (gl_VertexID == 2) corner = vec2(1.0, 1.0);
  else corner = vec2(0.0, 1.0);

  vec2 local = mix(u_localBounds.xy, u_localBounds.zw, corner);
  local *= a_scale;
  float angle = radians(a_rotation);
  mat2 rotationMatrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 worldPos = (u_systemTransform * vec3(rotationMatrix * local + a_translation, 1.0)).xy;
  vec3 clip = u_projection * vec3(worldPos, 1.0);

  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = mix(a_uvMin, a_uvMax, corner);
  v_color = a_color;
}`,

  particleFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_color;
}`,

  textVertexSource: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  float nodeIndex = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(nodeIndex * 0.0), 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord;
}`,

  textFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv);
}`,
}));

vi.mock('#rendering/webgl2/glsl/sprite.vert', () => ({ default: shaderSources.spriteVertexSource }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFragmentSource }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', () => ({ default: shaderSources.meshVertexSource }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', () => ({ default: shaderSources.meshFragmentSource }));
vi.mock('#rendering/webgl2/glsl/particle.vert', () => ({ default: shaderSources.particleVertexSource }));
vi.mock('#rendering/webgl2/glsl/particle.frag', () => ({ default: shaderSources.particleFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVertexSource }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFragmentSource }));

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

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
        webglAttributes: defaultWebGlAttributes,
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

// A solid-color quad (two triangles) in world space. Layout: position f32x2 @0,
// color u8x4-norm @8, stride 12. No texcoord — the default mesh path samples the
// 1×1 white texture, so the output is the vertex color × tint.
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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 5): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGL2 RenderingContext.drawGeometry', () => {
  test('renders a colored geometry quad at its world position', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(16, 16, 48, 48, [255, 0, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { view: screenView() });

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]); // inside the quad
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]); // outside → cleared black
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('applies the raw transform verbatim (translation)', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 32, 32, [0, 255, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Translate the quad from (0,0)-(32,32) to (32,32)-(64,64).
      context.drawGeometry(geometry, new Matrix(1, 0, 32, 0, 1, 32), { view: screenView() });

      expectPixelNear(readPixel(backend, 48, 48), [0, 255, 0, 255]); // inside the moved quad
      expectPixelNear(readPixel(backend, 12, 12), [0, 0, 0, 255]); // original location now empty
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('modulates the geometry color by the tint', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    // White geometry × a fractional tint resolves to the tint color.
    const geometry = coloredQuad(16, 16, 48, 48, [255, 255, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { tint: new Color(96, 160, 224), view: screenView() });

      expectPixelNear(readPixel(backend, 32, 32), [96, 160, 224, 255]);
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('draws multiple immediate geometries in call order', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const red = coloredQuad(8, 8, 32, 32, [255, 0, 0, 255]);
    const blue = coloredQuad(24, 24, 56, 56, [0, 0, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Blue is drawn after red, so it layers on top in the overlap region.
      context.drawGeometry(red, new Matrix(), { view: screenView() });
      context.drawGeometry(blue, new Matrix(), { view: screenView() });

      expectPixelNear(readPixel(backend, 12, 12), [255, 0, 0, 255]); // red-only region
      expectPixelNear(readPixel(backend, 50, 50), [0, 0, 255, 255]); // blue-only region
      expectPixelNear(readPixel(backend, 28, 28), [0, 0, 255, 255]); // overlap → blue on top
    } finally {
      red.destroy();
      blue.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
