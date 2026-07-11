/**
 * WebGL2 BitmapText browser tests.
 *
 * Closes a coverage gap in the renderer matrix: the WebGPU backend already
 * exercises the BitmapText / BmFont-adapter code path with a real pixel
 * readback (see the "BitmapText renders inside a Geometry stencil clip" test
 * in `webgpu-stencil-clip.test.ts`), but no WebGL2 browser test constructed a
 * `BitmapText` at all — the WebGL2 text browser suite
 * (`webgl2-text-layout.test.ts`, `webgl2-glyph-sdf.test.ts`) only drives the
 * runtime Canvas 2D / SDF `Text` node. `BitmapText` and `Text` share the same
 * renderer class (`WebGl2TextRenderer`), but BitmapText runs an entirely
 * different collection path (`_collectBitmapText` → the "color" shader,
 * `text-color.frag`, sampling an offline BMFont atlas page directly — no
 * runtime rasterisation, no shared `GlyphAtlasPool`).
 *
 * This file renders `BitmapText` nodes backed by a programmatically built
 * `BmFont` whose atlas page is a single solid-colour texture, so each glyph's
 * quad paints a deterministic, exactly-known colour — the same technique
 * `webgpu-stencil-clip.test.ts`'s `createSolidBitmapText` helper uses.
 *
 * ## Regression guard: first-flush uniforms (WebGl2TextRenderer)
 *
 * This test originally uncovered a real engine bug: `WebGl2TextRenderer
 * ._drawBatches()` called `shader.sync()` *before* setting that flush's
 * `u_projection` / `u_texture` / `u_nodeData` / `u_pageSize` uniforms. Because
 * `ShaderUniform.setValue()` only marks a uniform dirty for the *next* `sync()`,
 * the first flush of each text shaderType drew with a stale zero `u_projection`
 * — degenerate, so nothing rasterized. It self-healed from the second frame on
 * (the values are frame-constant), so no continuous-rendering test caught it,
 * but any genuine single-shot render (screenshot / render-to-texture pre-bake /
 * first frame) drew nothing. Fixed by moving `sync()` after the uniform writes,
 * matching every other WebGL2 renderer (uniforms first, `sync()` last). These
 * tests render exactly once (no warm-up) so they fail if that ordering regresses.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// ---------------------------------------------------------------------------
// Shader mocks
//
// The vitest shaderPlugin replaces every .vert/.frag import with
// `export default ""`. Replace the stubs with minimal but valid GLSL so
// renderer.connect() can compile the Sprite + Mesh + Text shaders that
// wireCoreRenderers() registers alongside our inline-GLSL renderer.
//
// textFrag directly samples `u_texture` (no tint/nodeData lookup): the real
// text-color.frag multiplies by a fillColor tint read from the node-data
// texture, but BitmapText's default fillColor is white (identity multiply),
// so a bare sample is pixel-equivalent for every assertion below.
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

  // Explicit layout locations are load-bearing: WebGl2TextRenderer links this
  // vertex source into THREE separate programs (sdf/msdf/color shaders), but
  // wires its single shared VAO's attribute pointers from only one of them
  // (the sdf shader). Without matching explicit locations, a GLSL linker is
  // free to assign a_position/a_texcoord/a_nodeIndex to different locations
  // per program even from identical source, desyncing the VAO from whichever
  // program is actually active when a "color" (BitmapText) batch draws.
  textVert: `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in float a_nodeIndex;
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

const createSolidTexture = (color: string, size: number): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size) before any
// node transform. The atlas page is a solid-colour texture, so the
// colour-atlas shader (msdf = false) emits that colour directly — deterministic
// pixels with no runtime font rasterisation or atlas-upload timing.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    // base === lineHeight ⇒ yBearing 0 ⇒ the glyph top sits at the line origin.
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BitmapText WebGL2 browser', () => {
  test('a solid-color glyph paints its atlas color at the glyph position, clear color elsewhere', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);

    try {
      text.setPosition(8, 8); // covers (8,8)-(40,40)

      render(backend, text);

      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      // Inside the 32×32 glyph quad, anchored at (8, 8).
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 38, 38), [255, 0, 0, 255]);
      // Outside the glyph quad — untouched clear color.
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 56, 56), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('two BitmapText nodes render distinct colors without bleeding into the gap between them', async () => {
    const backend = await createBackend();
    const { text: redText, texture: redTexture } = createSolidBitmapText('#ff0000', 24);
    const { text: greenText, texture: greenTexture } = createSolidBitmapText('#00ff00', 24);
    const root = new Container();

    try {
      redText.setPosition(4, 4); // covers (4,4)-(28,28)
      greenText.setPosition(36, 4); // covers (36,4)-(60,28)
      root.addChild(redText, greenText);

      render(backend, root);

      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]); // inside red glyph
      expectPixelNear(readPixel(backend, 48, 16), [0, 255, 0, 255]); // inside green glyph
      expectPixelNear(readPixel(backend, 32, 16), [0, 0, 0, 255]); // gap between them
    } finally {
      root.destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('node transform (position) is applied to the glyph quad', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 16);

    try {
      text.setPosition(40, 40); // covers (40,40)-(56,56)

      render(backend, text);

      expectPixelNear(readPixel(backend, 48, 48), [255, 0, 0, 255]);
      // The origin — where the glyph would sit without the transform — stays clear.
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
