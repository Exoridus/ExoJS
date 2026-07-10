/**
 * WebGL2 AnimatedSprite browser test — v0.16 renderer-matrix follow-up.
 *
 * {@link AnimatedSprite} reuses the normal Sprite renderer but swaps the
 * texture-frame UV sub-region per animation frame. This asserts that swap
 * actually samples the correct sub-rect of a shared spritesheet texture: a
 * two-cell spritesheet (each cell a distinct solid color) is rendered at
 * frame 0, then advanced to frame 1, with pixel reads proving the sampled
 * color changes to match the new cell.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`. `WebGl2Backend#initialize` connects the renderer
// registry eagerly (compiling every registered renderer's program, not just
// the ones a given test renders), so the Sprite + Mesh + Text shaders that
// `wireCoreRenderers()` registers all need valid GLSL sources even though
// this file only ever renders an AnimatedSprite (which uses the Sprite
// renderer).
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
  float ni = a_nodeIndex;
  vec3 clip = u_projection * vec3(a_position + vec2(ni * 0.0), 1.0);
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
const cellSize = 16;

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

/**
 * Builds a horizontal N-cell spritesheet texture, each cell filled with a
 * distinct solid color, so a frame swap is provably a different sub-rect
 * rather than a coincidentally-similar sample.
 */
const createSpritesheetTexture = (colors: readonly string[], size = cellSize): Texture => {
  const src = document.createElement('canvas');

  src.width = size * colors.length;
  src.height = size;

  const ctx = src.getContext('2d')!;

  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index * size, 0, size, size);
  });

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 AnimatedSprite — frame-region UV swap', () => {
  test('frame 0 samples the first spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      // Interior of the sprite (16x16 at 8,8 → covers 8..24) shows cell 0 (red)
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      // Outside the sprite's bounds remains the clear color (black)
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('advancing playback swaps to the second spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);

      // Advance exactly one frame's worth of time (fps 10 → 100ms/frame)
      sprite.update(100);
      expect(sprite.currentFrame).toBe(1);

      render(backend, root);

      // Same screen position now samples cell 1 (blue) — proves the UV
      // sub-rect swap, not just a re-render of the same frame.
      expectPixelNear(readPixel(backend, 16, 16), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('play() restart returns playback to the first spritesheet cell', async () => {
    const backend = await createBackend();
    const texture = createSpritesheetTexture(['#ff0000', '#0000ff']);
    const root = new Container();
    const sprite = new AnimatedSprite(texture, {
      cells: { frames: [new Rectangle(0, 0, cellSize, cellSize), new Rectangle(cellSize, 0, cellSize, cellSize)], fps: 10 },
    });

    try {
      sprite.play('cells');
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      sprite.update(100);
      expect(sprite.currentFrame).toBe(1);

      // Restart (the default) rewinds to frame 0
      sprite.play('cells');
      expect(sprite.currentFrame).toBe(0);

      render(backend, root);

      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
