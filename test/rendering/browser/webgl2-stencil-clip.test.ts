import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The vitest shaderPlugin replaces every .vert/.frag import with `export
// default ""`, so the real engine shaders are mocked with working GLSL here.
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
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv;
out vec4 v_color;
out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 transform = mat3(
    m0.x, m0.z, 0.0,
    m0.y, m0.w, 0.0,
    m1.x, m1.y, 1.0
  );
  vec3 world = transform * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord;
  v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_color * v_tint;
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

  stencilVertexSource: `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
uniform mat3 u_matrix;
void main(void) {
  gl_Position = vec4((u_matrix * vec3(a_position, 1.0)).xy, 0.0, 1.0);
}`,

  stencilFragmentSource: `#version 300 es
precision lowp float;
layout(location = 0) out vec4 fragColor;
void main(void) {
  fragColor = vec4(0.0);
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
vi.mock('#rendering/webgl2/glsl/stencil-clip.vert', () => ({ default: shaderSources.stencilVertexSource }));
vi.mock('#rendering/webgl2/glsl/stencil-clip.frag', () => ({ default: shaderSources.stencilFragmentSource }));

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;
// antialias:true is required ONLY for the test environment: the headless
// SwiftShader build used by Playwright drops stencil-buffer WRITES (stencilOp
// INCR/REPLACE are silently no-ops) when the context is single-sampled
// (antialias:false), even though STENCIL_BITS reports 8 and the stencil TEST +
// clear work. With a multisampled context, stencil writes work correctly.
// This is a SwiftShader limitation, not an engine issue — real browsers/GPUs
// honor stencil writes regardless of antialias (the production backend forces
// `stencil:true` and is unaffected). Axis-aligned clip shapes keep MSAA edges
// crisp so pixel assertions stay exact away from the boundary.
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
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

const render = (backend: WebGl2Backend, node: RenderNode): number => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return backend.stats.drawCalls;
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 6): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, width = 64, height = 64): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

// Right triangle covering the lower-left half of a `size` box anchored at the
// origin: (0,0) -> (size,0) -> (0,size). The hypotenuse runs from top-left to
// bottom-right; points with x+y < size are inside.
const createRightTriangle = (size: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, size, 0, 0, size]),
    stride: 8,
  });

const createQuadGeometry = (x: number, y: number, width: number, height: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([x, y, x + width, y, x + width, y + height, x, y, x + width, y + height, x, y + height]),
    stride: 8,
  });

describe('WebGL2 stencil clipping', () => {
  test('Geometry clipShape discards fragments outside the shape', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      // Inside the triangle (x + y << 48): red survives.
      expectPixelNear(readPixel(backend, 6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle clipShape still works (scissor path, no stencil shader)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = new Rectangle(16, 16, 16, 16);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle alpha mask is unaffected by the stencil path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const masked = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      masked.mask = new Rectangle(16, 16, 16, 16);
      masked.addChild(sprite);
      root.addChild(masked);

      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('nested stencil clips render only the intersection', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const outer = new Container();
    const inner = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Outer clip: left half (x in [0,32)). Inner clip: top half (y in [0,32)).
      outer.clip = true;
      outer.clipShape = createQuadGeometry(0, 0, 32, 64);
      inner.clip = true;
      inner.clipShape = createQuadGeometry(0, 0, 64, 32);
      inner.addChild(sprite);
      outer.addChild(inner);
      root.addChild(outer);

      render(backend, root);

      // Intersection (top-left quadrant): visible.
      expectPixelNear(readPixel(backend, 12, 12), [255, 0, 0, 255]);
      // Only outer (bottom-left): clipped by inner.
      expectPixelNear(readPixel(backend, 12, 48), [0, 0, 0, 255]);
      // Only inner (top-right): clipped by outer.
      expectPixelNear(readPixel(backend, 48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (outer.clipShape as Geometry).destroy();
      (inner.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stencil clip composes with a scissor rect (intersection)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Stencil: left half. Scissor (mask Rectangle): top half. Both restrict.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.mask = new Rectangle(0, 0, 64, 32);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      // Top-left: inside both.
      expectPixelNear(readPixel(backend, 12, 12), [255, 0, 0, 255]);
      // Bottom-left: inside stencil, outside scissor.
      expectPixelNear(readPixel(backend, 12, 48), [0, 0, 0, 255]);
      // Top-right: inside scissor, outside stencil.
      expectPixelNear(readPixel(backend, 48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a clipped container clips multiple children', async () => {
    const backend = await createBackend();
    const redTexture = createSolidTexture('#ff0000');
    const greenTexture = createSolidTexture('#00ff00');
    const root = new Container();
    const clipped = new Container();
    const left = new Sprite(redTexture);
    const right = new Sprite(greenTexture);

    try {
      left.setPosition(0, 0);
      left.width = 24;
      left.height = 64;
      right.setPosition(40, 0);
      right.width = 24;
      right.height = 64;
      // Clip to the top half: both children keep their top, lose their bottom.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 64, 32);
      clipped.addChild(left, right);
      root.addChild(clipped);

      render(backend, root);

      expectPixelNear(readPixel(backend, 8, 12), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 48, 12), [0, 255, 0, 255]);
      // Both clipped away below y=32.
      expectPixelNear(readPixel(backend, 8, 48), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 48, 48), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('scene without clip renders pixel-identically after the framebuffer change', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.width = 24;
      sprite.height = 24;
      root.addChild(sprite);

      render(backend, root);

      // STENCIL_TEST is inert without a clip — the plain sprite is unchanged.
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stencil clip emits no extra render pass (unlike the alpha-mask path)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      // The stencil path renders inline (no RT capture); the alpha-mask path
      // would have incremented renderPasses via BackendTargetPass.
      expect(backend.stats.renderPasses).toBe(0);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an unbalanced stencil stack would surface; balanced clips do not throw', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      // A correct render with balanced push/pop must not throw.
      expect(() => render(backend, root)).not.toThrow();
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
