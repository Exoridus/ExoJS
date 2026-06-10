/**
 * WebGL2 RepeatingSprite browser tests.
 *
 * Validates both rendering paths:
 *  - Shader path: bare {@link Texture} source, UV tiling computed in the vertex
 *    shader, GPU sampler handles wrapping.
 *  - Geometry path: {@link TextureRegion} source, Cartesian-product quads built
 *    on the CPU, clamped UVs.
 *
 * Also verifies that sampler objects are properly unbound after each shader-path
 * flush so that a subsequent {@link Sprite} render on the same texture unit is
 * not affected by the repeating-sprite sampler configuration.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`.  Replace the stubs with minimal but valid GLSL so
// renderer.connect() can compile the Sprite + Mesh + Text shaders that
// wireCoreRenderers() registers alongside our inline-GLSL renderer.
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
  v_uv = uv; v_color = a_color; v_textureSlot = a_textureSlot;
}`,

  spriteFrag: `#version 300 es
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
void main() { outColor = sampleTexture(v_textureSlot, v_uv) * v_color; }`,

  meshVert: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;
uniform mat3 u_projection;
uniform sampler2D u_transforms;
out vec2 v_uv; out vec4 v_color; out vec4 v_tint;
void main() {
  int row = int(a_nodeIndex);
  vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
  vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
  mat3 t = mat3(m0.x,m0.z,0.0, m0.y,m0.w,0.0, m1.x,m1.y,1.0);
  vec3 world = t * vec3(a_position, 1.0);
  vec3 clip = u_projection * world;
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv = a_texcoord; v_color = a_color;
  v_tint = texelFetch(u_transforms, ivec2(2, row), 0);
}`,

  meshFrag: `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in vec4 v_tint;
uniform sampler2D u_texture;
out vec4 outColor;
void main() { outColor = texture(u_texture, v_uv) * v_color * v_tint; }`,

  textVert: `#version 300 es
precision mediump float;
in vec2 a_position; in vec2 a_texcoord; in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  vec3 clip = u_projection * vec3(a_position, 1.0);
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
vi.mock('#rendering/webgl2/glsl/sprite.frag', () => ({ default: shaderSources.spriteFrag }));
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

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
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

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const buf = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return [buf[0], buf[1], buf[2], buf[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Shader path tests (bare Texture source)
// ---------------------------------------------------------------------------

describe('WebGL2 RepeatingSprite — shader path', () => {
  test('solid-color texture fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      // Interior of the sprite should be red
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]);
      // Outside the sprite's bounds remains black
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stretch mode fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 8, 8);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 48, height: 48,
      modeX: 'stretch', modeY: 'stretch',
    });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 24), [0, 255, 0, 255]);
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat fills destination without error', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 40, height: 40,
      modeX: 'mirror-repeat', modeY: 'mirror-repeat',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      // Interior pixel should have blue component (exact value varies by mirror phase)
      const pixel = readPixel(backend, 20, 20);

      expect(pixel[2]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied to rendered output', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = Color.fromRgb(255, 0, 0);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readPixel(backend, 16, 16);

      expect(pixel[0]).toBeGreaterThan(128);
      expect(pixel[1]).toBeLessThan(32);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size sprite does not crash and renders nothing', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      expect(() => render(backend, root)).not.toThrow();
      // No pixels should be red — zero-size renders nothing
      expectPixelNear(readPixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sampler isolation: Sprite on same texture is not affected', async () => {
    // After flushing a RepeatingSprite (shader path, which binds a sampler
    // for repeat wrapping), the sampler must be unbound from texture unit 0
    // so that a subsequent Sprite on the same texture is not affected.
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();

    // Shader-path repeating sprite at (4, 4), size 20×20
    const repeating = new RepeatingSprite(texture, { width: 20, height: 20 });
    // Regular sprite at (36, 4), size 16×16
    const regular = new Sprite(texture);

    try {
      repeating.setPosition(4, 4);
      regular.setPosition(36, 4);
      root.addChild(repeating, regular);

      render(backend, root);

      // Both should show red — sampler state must not corrupt the sprite
      expectPixelNear(readPixel(backend, 12, 12), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 42, 10), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('node transform (position) is applied', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 16, height: 16 });

    try {
      // Sprite at (40, 40) — interior at (44, 44)
      sprite.setPosition(40, 40);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 44, 44), [255, 0, 0, 255]);
      // Position (10, 10) is outside the sprite's bounds
      expectPixelNear(readPixel(backend, 10, 10), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry path tests (TextureRegion source)
// ---------------------------------------------------------------------------

describe('WebGL2 RepeatingSprite — geometry path', () => {
  test('solid-color atlas region fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 32, 32);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readPixel(backend, 16, 16), [0, 0, 255, 255]);
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('clip-fit geometry path renders correctly', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff8800', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, {
      width: 40, height: 40,
      modeX: 'repeat', modeY: 'repeat',
      fitX: 'clip', fitY: 'clip',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readPixel(backend, 20, 20);

      // Should be orange-ish (non-zero red and green, low blue)
      expect(pixel[0]).toBeGreaterThan(128);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied on geometry path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = Color.fromRgb(0, 255, 0);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readPixel(backend, 20, 20);

      expect(pixel[0]).toBeLessThan(32);
      expect(pixel[1]).toBeGreaterThan(128);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size geometry path does not crash', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      expect(() => render(backend, root)).not.toThrow();
      expectPixelNear(readPixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat geometry path fills destination without error', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, {
      width: 48, height: 48,
      modeX: 'mirror-repeat', modeY: 'mirror-repeat',
      fitX: 'round', fitY: 'round',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readPixel(backend, 24, 24);

      expect(pixel[0]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
