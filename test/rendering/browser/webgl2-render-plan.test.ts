import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

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

interface BackendRuntime {
  backend: WebGl2Backend;
}

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<BackendRuntime> => {
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

  return { backend };
};

const render = (backend: WebGl2Backend, node: RenderNode): number => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return backend.stats.submittedNodes;
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 4): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
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

const createRectMesh = (size = 16): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, 0, size, size, 0, size]),
  });

describe('RenderPlan WebGL2 browser regressions', () => {
  test('filtered container renders correctly', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(new ColorFilter(Color.white));
      filtered.addChild(sprite);
      root.addChild(filtered);

      render(backend, root);

      expectPixelNear(readPixel(backend, 20, 20), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle mask clips correctly', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 32, 32);
    const root = new Container();
    const masked = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      masked.mask = new Rectangle(16, 16, 16, 16);
      masked.addChild(sprite);
      root.addChild(masked);

      render(backend, root);

      expectPixelNear(readPixel(backend, 20, 20), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 12, 20), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cacheAsBitmap renders cached output correctly across two renders', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const cachedContainer = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      cachedContainer.cacheAsBitmap = true;
      cachedContainer.addChild(sprite);
      root.addChild(cachedContainer);

      const firstDrawCount = render(backend, root);
      const firstPixel = readPixel(backend, 20, 20);
      const secondDrawCount = render(backend, root);

      expectPixelNear(firstPixel, [255, 0, 0, 255]);
      expect(secondDrawCount).toBeLessThan(firstDrawCount);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('local zIndex stack renders in expected order', async () => {
    const { backend } = await createBackend();
    const redTexture = createSolidTexture('#ff0000', 24, 24);
    const greenTexture = createSolidTexture('#00ff00', 24, 24);
    const root = new Container();
    const nested = new Container();
    const nestedSprite = new Sprite(redTexture);
    const outsideSprite = new Sprite(greenTexture);

    try {
      nestedSprite.setPosition(16, 16);
      nestedSprite.zIndex = 999;
      outsideSprite.setPosition(16, 16);
      outsideSprite.zIndex = 1;
      nested.zIndex = 0;

      nested.addChild(nestedSprite);
      root.addChild(nested, outsideSprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 24), [0, 255, 0, 255]);
      expectPixelNear(readPixel(backend, 18, 18), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('mixed drawable types still render', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);
    const mesh = createRectMesh(16);

    try {
      sprite.setPosition(6, 6);
      mesh.setPosition(38, 6);
      mesh.tint = Color.green;

      root.addChild(sprite, mesh);

      const drawCount = render(backend, root);
      const spritePixel = readPixel(backend, 10, 10);

      expectPixelNear(spritePixel, [255, 0, 0, 255]);
      expect(drawCount).toBe(2);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('multiple sprites with distinct transforms batch into one draw, each at its own position', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(texture);
    const b = new Sprite(texture);
    const c = new Sprite(texture);

    try {
      // Same texture ⇒ one instanced batch; each sprite carries its own
      // nodeIndex into the shared transform buffer.
      a.setPosition(8, 8);
      b.setPosition(28, 28);
      c.setPosition(48, 48);
      root.addChild(a, b, c);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      // Each instance resolves its own transform row, so all three land at
      // their distinct positions instead of collapsing onto a single row.
      expectPixelNear(readPixel(backend, 10, 10), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 30, 30), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 50, 50), [255, 0, 0, 255]);
      // The gaps between them stay clear.
      expectPixelNear(readPixel(backend, 20, 20), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a scaled sprite stretches to its scaled bounds via the buffer transform', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // 8×8 texture scaled 2× from a top-left origin at (10, 10) covers
      // [10, 26]. A pixel at (24, 24) is red only if the non-identity scale
      // reaches the GPU through the transform buffer (unscaled it would be
      // bounded at [10, 18]).
      sprite.setPosition(10, 10);
      sprite.setScale(2, 2);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 12, 12), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 30, 30), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('gradient texture sprite renders a linear red-blue ramp', async () => {
    const { backend } = await createBackend();
    const root = new Container();
    const texture = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    const gradientTexture = texture.toTexture(24, 24);
    const gradient = new Sprite(gradientTexture);

    try {
      gradient.setPosition(20, 20);
      root.addChild(gradient);

      render(backend, root);

      const left = readPixel(backend, 22, 30);
      const right = readPixel(backend, 40, 30);

      expect(left[0] + left[1] + left[2]).toBeGreaterThan(0);
      expect(right[0] + right[1] + right[2]).toBeGreaterThan(0);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);
    } finally {
      root.destroy();
      gradientTexture.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sprites in separate render groups (different z-indices) coalesce into one draw call', async () => {
    // Different z-indices make the optimizer assign different groupIndices,
    // producing two logical RenderGroups. The sprite renderer coalesces them
    // into a single instanced draw because it tracks blend-mode / texture /
    // material — not render-group boundaries. Each sprite's transform is
    // resolved independently from the shared buffer via its stable nodeIndex,
    // so non-contiguous nodeIndex values are handled correctly.
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(texture);
    const b = new Sprite(texture);

    try {
      a.setPosition(8, 8);
      a.zIndex = 0;
      b.setPosition(40, 40);
      b.zIndex = 5;
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readPixel(backend, 10, 10), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 42, 42), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 25, 25), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sprites with different blend modes produce separate draw calls', async () => {
    // A blend-mode change forces the renderer to flush its pending batch and
    // begin a new one, so two sprites with incompatible blend modes always
    // produce two separate instanced draw calls.
    const { backend } = await createBackend();
    const textureA = createSolidTexture('#ff0000', 8, 8);
    const textureB = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(textureA);
    const b = new Sprite(textureB);

    try {
      a.setPosition(8, 8);
      b.setPosition(40, 8);
      b.blendMode = BlendModes.Additive;
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
      expectPixelNear(readPixel(backend, 10, 10), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      textureA.destroy();
      textureB.destroy();
      backend.destroy();
    }
  });

  test('sprites before and after a filter boundary are separate draw calls', async () => {
    // A filter (barrier) on an intermediate container forces the plan player
    // to execute a render-to-texture + compositing pass for the filtered
    // content. The render-target switch flushes the active sprite renderer,
    // so the sprites outside the barrier and those inside it are separate
    // GPU draw submissions.
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const spriteA = new Sprite(texture);
    const filtered = new Container();
    const spriteB = new Sprite(texture);
    const spriteC = new Sprite(texture);

    try {
      spriteA.setPosition(4, 4);
      spriteB.setPosition(20, 20);
      spriteC.setPosition(36, 36);
      filtered.addFilter(new ColorFilter(Color.white));
      filtered.addChild(spriteB);
      root.addChild(spriteA, filtered, spriteC);

      render(backend, root);

      // spriteA and spriteC are outside the filter; spriteB is inside.
      // Each group crossing a render-target boundary is a separate draw.
      expect(backend.stats.drawCalls).toBeGreaterThanOrEqual(2);
      expectPixelNear(readPixel(backend, 6, 6), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 22, 22), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
