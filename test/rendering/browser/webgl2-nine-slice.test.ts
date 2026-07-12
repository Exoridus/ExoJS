/**
 * WebGL2 NineSliceSprite browser tests.
 *
 * Validates the 9-region UV mapping that {@link NineSliceSprite} builds via
 * `buildNineSliceQuads`: a source texture is divided into 9 colour-coded
 * regions (4 corners, 4 edges, 1 center) and rendered at a destination size
 * much larger than the source. Correct UV mapping means:
 *  - Corners land at their exact destination position, unstretched.
 *  - Edges/center fill the remaining space (default `'stretch'` mode).
 *  - Each side's border can be sized independently (asymmetric borders),
 *    proving edges are scaled per-axis rather than uniformly.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
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
// this file only ever renders a NineSliceSprite (whose renderer uses inline
// GLSL directly, not `.vert`/`.frag` imports, so it needs no mock).
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
  v_uv = uv; v_color = texelFetch(u_transforms, ivec2(2, int(a_nodeIndex)), 0); v_textureSlot = a_textureSlot;
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

// ---------------------------------------------------------------------------
// Fixture: a 16x16 texture divided into 9 colour-coded regions with a uniform
// 4px slice inset on every side.
//
//   +----+--------+----+
//   | TL |  top   | TR |
//   +----+--------+----+
//   |left| center |right
//   +----+--------+----+
//   | BL | bottom | BR |
//   +----+--------+----+
//
// Nearest-neighbour sampling keeps region boundaries pixel-sharp: with the
// default linear filter, magnifying a 4px source region to a 12-24px
// destination bleeds a couple of screen pixels of the adjacent region's
// colour across every slice seam (expected GPU behaviour, not a bug), which
// would make boundary-pixel assertions flaky.
// ---------------------------------------------------------------------------

const colors = {
  tl: [255, 0, 0, 255],
  tr: [0, 255, 0, 255],
  bl: [0, 0, 255, 255],
  br: [255, 255, 0, 255],
  top: [255, 0, 255, 255],
  bottom: [0, 255, 255, 255],
  left: [255, 128, 0, 255],
  right: [128, 0, 255, 255],
  center: [255, 255, 255, 255],
} as const satisfies Record<string, RgbaTuple>;

const createNineSliceTexture = (): Texture => {
  const src = document.createElement('canvas');

  src.width = 16;
  src.height = 16;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = 'rgb(255, 0, 0)';
  ctx.fillRect(0, 0, 4, 4); // TL corner

  ctx.fillStyle = 'rgb(0, 255, 0)';
  ctx.fillRect(12, 0, 4, 4); // TR corner

  ctx.fillStyle = 'rgb(0, 0, 255)';
  ctx.fillRect(0, 12, 4, 4); // BL corner

  ctx.fillStyle = 'rgb(255, 255, 0)';
  ctx.fillRect(12, 12, 4, 4); // BR corner

  ctx.fillStyle = 'rgb(255, 0, 255)';
  ctx.fillRect(4, 0, 8, 4); // top edge

  ctx.fillStyle = 'rgb(0, 255, 255)';
  ctx.fillRect(4, 12, 8, 4); // bottom edge

  ctx.fillStyle = 'rgb(255, 128, 0)';
  ctx.fillRect(0, 4, 4, 8); // left edge

  ctx.fillStyle = 'rgb(128, 0, 255)';
  ctx.fillRect(12, 4, 4, 8); // right edge

  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(4, 4, 8, 8); // center

  return new Texture(src, { scaleMode: ScaleModes.Nearest });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 NineSliceSprite', () => {
  test('9-region UV mapping: corners, edges, and center land at their correct destination area', async () => {
    const backend = await createBackend();
    const texture = createNineSliceTexture();
    const root = new Container();
    // Destination 48x48 at (8,8) → occupies [8,56) on both axes.
    // Uniform border of 12 → columns/rows at abs 8, 20, 44, 56.
    const sprite = new NineSliceSprite(texture, { slices: 4, border: 12, width: 48, height: 48 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      // Corner centers
      expectPixelNear(readPixel(backend, 14, 14), colors.tl);
      expectPixelNear(readPixel(backend, 50, 14), colors.tr);
      expectPixelNear(readPixel(backend, 14, 50), colors.bl);
      expectPixelNear(readPixel(backend, 50, 50), colors.br);

      // Edge centers
      expectPixelNear(readPixel(backend, 32, 14), colors.top);
      expectPixelNear(readPixel(backend, 32, 50), colors.bottom);
      expectPixelNear(readPixel(backend, 14, 32), colors.left);
      expectPixelNear(readPixel(backend, 50, 32), colors.right);

      // Center
      expectPixelNear(readPixel(backend, 32, 32), colors.center);

      // Corner/edge boundary sharpness (horizontal): the TL corner column
      // ends exactly at dest x=20 — one pixel inside remains corner colour,
      // one pixel past the boundary is already the (stretched) edge colour.
      expectPixelNear(readPixel(backend, 19, 14), colors.tl);
      expectPixelNear(readPixel(backend, 21, 14), colors.top);

      // Corner/edge boundary sharpness (vertical), same column.
      expectPixelNear(readPixel(backend, 14, 19), colors.tl);
      expectPixelNear(readPixel(backend, 14, 21), colors.left);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('asymmetric borders scale each edge independently per axis', async () => {
    const backend = await createBackend();
    const texture = createNineSliceTexture();
    const root = new Container();
    // Destination fills the whole 64x64 canvas at (0,0).
    // border: left=8, top=16, right=24, bottom=32 (all different) →
    // columns at abs x = 0, 8, 40, 64; rows at abs y = 0, 16, 32, 64.
    const sprite = new NineSliceSprite(texture, {
      slices: 4,
      border: { left: 8, top: 16, right: 24, bottom: 32 },
      width: 64,
      height: 64,
    });

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);

      render(backend, root);

      // Corner centers — each corner's footprint matches its own border size.
      expectPixelNear(readPixel(backend, 4, 8), colors.tl); // 8x16
      expectPixelNear(readPixel(backend, 52, 8), colors.tr); // 24x16
      expectPixelNear(readPixel(backend, 4, 48), colors.bl); // 8x32
      expectPixelNear(readPixel(backend, 52, 48), colors.br); // 24x32

      // Edge centers
      expectPixelNear(readPixel(backend, 24, 8), colors.top);
      expectPixelNear(readPixel(backend, 24, 48), colors.bottom);
      expectPixelNear(readPixel(backend, 4, 24), colors.left);
      expectPixelNear(readPixel(backend, 52, 24), colors.right);

      // Center
      expectPixelNear(readPixel(backend, 24, 24), colors.center);

      // Boundary sanity, at a margin clear of GPU raster rounding right on an
      // exact integer seam: still inside the top-left corner just before its
      // row boundary (y=16), then already past the (smaller) left border
      // (x=8) into the top edge, then already past the top border into the
      // left edge — proving left/top were honoured independently rather than
      // forced symmetric with right/bottom.
      expectPixelNear(readPixel(backend, 4, 12), colors.tl);
      expectPixelNear(readPixel(backend, 12, 8), colors.top);
      expectPixelNear(readPixel(backend, 4, 20), colors.left);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied uniformly across all nine regions', async () => {
    const backend = await createBackend();
    const texture = createNineSliceTexture();
    const root = new Container();
    const sprite = new NineSliceSprite(texture, { slices: 4, border: 12, width: 48, height: 48 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0);
      root.addChild(sprite);

      render(backend, root);

      // Center source colour is white; tinted red, it should render pure red.
      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]);
      // TR corner source colour is green; tinted red, the green channel must
      // be crushed out (red tint multiplies green/blue channels to 0).
      const trPixel = readPixel(backend, 50, 14);

      expect(trPixel[1]).toBeLessThan(32);
      expect(trPixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
