import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexGlsl } from '#rendering/sprite/spriteMaterialSources';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The sprite vertex mock keeps the REAL pinned attribute
// locations (0..5) so the renderer's shared VAO matches the custom material's
// `spriteVertexGlsl` (which is also location-pinned). The custom path compiles
// the real `spriteVertexGlsl` constant — that module is not a `.vert` import and
// is therefore NOT mocked.
const shaderSources = vi.hoisted(() => ({
  spriteVertexSource: `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_localBounds;
layout(location = 3) in vec4 a_uvBounds;
layout(location = 4) in vec4 a_color;
layout(location = 5) in uint a_textureSlot;
layout(location = 6) in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;
void main() {
  int vid = gl_VertexID;
  int cornerX = vid & 1;
  int cornerY = (vid >> 1) & 1;
  float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
  float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
  float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;
  gl_Position = vec4((u_projection * vec3(worldX, worldY, 1.0)).xy, 0.0, 1.0);
  float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
  float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
  v_texcoord = vec2(u, v);
  v_color = vec4(a_color.rgb * a_color.a, a_color.a);
  v_textureSlot = a_textureSlot;
}`,

  spriteFragmentSource: `#version 300 es
precision mediump float;
in vec2 v_texcoord;
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
  outColor = sampleTexture(v_textureSlot, v_texcoord) * v_color;
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

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 5): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (r: number, g: number, b: number, a = 255, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

// Custom fragment: samples the per-batch base texture (u_texture, unit 0) and
// modulates it by a user vec4 uniform.
const tintFragment = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
uniform sampler2D u_texture;
uniform vec4 u_userColor;
out vec4 fragColor;
void main() {
  vec4 base = texture(u_texture, v_texcoord);
  fragColor = vec4(base.rgb * u_userColor.rgb, 1.0);
}`;

// Custom fragment: ignores the base texture and outputs a material texture
// bound on unit 1 — proves material-texture binding is independent of the base.
const patternFragment = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
uniform sampler2D u_texture;
uniform sampler2D u_pattern;
out vec4 fragColor;
void main() {
  fragColor = vec4(texture(u_pattern, v_texcoord).rgb, 1.0);
}`;

const createTintMaterial = (color: readonly [number, number, number, number]): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: tintFragment } }),
    uniforms: { u_userColor: color },
  });

describe('custom SpriteMaterial WebGL2 browser', () => {
  test('renders a custom fragment sampling the base texture and a user uniform', async () => {
    const backend = await createBackend();
    // Mid-gray base proves the texture is sampled; the per-channel uniform
    // proves uniform binding. (0.5,0.5,0.5) * (1,0,0.5) → (128, 0, 64).
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 0, 0.5, 1]);
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);

      expectPixelNear(readPixel(backend, 24, 24), [128, 0, 64, 255]);
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      sprite.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('reflects a mutated material uniform on the next frame', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(255, 255, 255);
    const material = createTintMaterial([1, 0, 0, 1]);
    const sprite = new Sprite(texture);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);
      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);

      material.setUniform('u_userColor', [0, 0, 1, 1]);
      render(backend, sprite);
      expectPixelNear(readPixel(backend, 24, 24), [0, 0, 255, 255]);
    } finally {
      sprite.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('binds a material texture on unit 1 independent of the base texture', async () => {
    const backend = await createBackend();
    const base = createSolidTexture(255, 0, 0);
    const pattern = createSolidTexture(0, 255, 0);
    const material = new SpriteMaterial({
      shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: patternFragment } }),
      textures: { u_pattern: pattern },
    });
    const sprite = new Sprite(base);

    try {
      sprite.material = material;
      sprite.setPosition(16, 16);

      render(backend, sprite);

      // Output is the green pattern, not the red base.
      expectPixelNear(readPixel(backend, 24, 24), [0, 255, 0, 255]);
    } finally {
      sprite.destroy();
      material.destroy();
      pattern.destroy();
      base.destroy();
      backend.destroy();
    }
  });

  test('three sprites sharing a material and base texture batch into one instanced draw', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();
    const sprites = [new Sprite(texture), new Sprite(texture), new Sprite(texture)];

    try {
      sprites.forEach((sprite, index) => {
        sprite.material = material;
        sprite.setPosition(8 + index * 14, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a base-texture switch breaks the custom-material batch', async () => {
    const backend = await createBackend();
    const textureA = createSolidTexture(200, 0, 0);
    const textureB = createSolidTexture(0, 0, 200);
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();
    const spriteA = new Sprite(textureA);
    const spriteB = new Sprite(textureB);

    try {
      spriteA.material = material;
      spriteB.material = material;
      spriteA.setPosition(8, 16);
      spriteB.setPosition(36, 16);
      root.addChild(spriteA);
      root.addChild(spriteB);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      textureA.destroy();
      textureB.destroy();
      backend.destroy();
    }
  });

  test('a material switch breaks the batch', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const materialA = createTintMaterial([1, 0, 0, 1]);
    const materialB = createTintMaterial([0, 1, 0, 1]);
    const root = new Container();
    const spriteA = new Sprite(texture);
    const spriteB = new Sprite(texture);

    try {
      spriteA.material = materialA;
      spriteB.material = materialB;
      spriteA.setPosition(8, 16);
      spriteB.setPosition(36, 16);
      root.addChild(spriteA);
      root.addChild(spriteB);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      materialA.destroy();
      materialB.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('default material-less sprites still merge multiple base textures into one draw', async () => {
    const backend = await createBackend();
    const textures = [createSolidTexture(255, 0, 0), createSolidTexture(0, 255, 0), createSolidTexture(0, 0, 255)];
    const root = new Container();

    try {
      textures.forEach((texture, index) => {
        const sprite = new Sprite(texture);
        sprite.setPosition(4 + index * 16, 16);
        root.addChild(sprite);
      });

      render(backend, root);

      // 8-slot multi-texture batching keeps three distinct textures in one draw.
      expect(backend.stats.drawCalls).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });

  test('a default sprite followed by a custom-material sprite uses two draws', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture(128, 128, 128);
    const material = createTintMaterial([1, 1, 1, 1]);
    const root = new Container();
    const plain = new Sprite(texture);
    const custom = new Sprite(texture);

    try {
      plain.setPosition(8, 16);
      custom.material = material;
      custom.setPosition(36, 16);
      root.addChild(plain);
      root.addChild(custom);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
    } finally {
      root.destroy();
      material.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
