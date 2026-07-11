/**
 * WebGL2 renderer-matrix browser tests — RetainedContainer pixel cells
 * (Track B Slice 2, spec §8/§10(d) correctness gate).
 *
 * Seven cells asserting real rendered output for the retained-group feature
 * shipped across tasks 3-8: camera motion over a retained fragment, a group
 * move via the group matrix, a child mutation inside the group, a tint/alpha
 * change inside the group, bitmap text lifted by the group uniform, an
 * effect-bearing direct child (cacheAsBitmap) that escapes the group
 * convention, and a depth-2 effect node that disengages the boundary
 * (plan D-P4 Option A) while keeping pixel-correct plain-Container output.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
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
// this file only ever renders Sprite/BitmapText nodes.
//
// spriteVert and the extended textVert both declare/multiply `u_group`
// (copied from webgl2-group-uniform.test.ts, task 3's proof entry) so the
// group uniform lifts both sprite and bitmap-text vertices the same way the
// production shaders do (spec §7 text exception).
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

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size) before any
// node transform. The atlas page is a solid-colour texture, so the
// colour-atlas shader (msdf = false) emits that colour directly — deterministic
// pixels with no runtime font rasterisation or atlas-upload timing. Copied
// verbatim from webgl2-bitmap-text.test.ts's font fixture.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size, size);
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

describe('WebGL2 renderer matrix: RetainedContainer cells', () => {
  test('cell 1 — retained group under camera motion: fragment splices, pixels track the view', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root); // frame 1: full collect + capture
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);

      // Pan the camera 16px right: the sprite must appear 16px further left.
      // The default view of a 64x64 canvas is centered at (32, 32).
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, root); // frame 2: spliced (no re-collect) — must still track the view

      expectPixelNear(readPixel(backend, 0, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 24, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — group move: one matrix update relocates the whole group', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readPixel(backend, 8, 8), [0, 255, 0, 255]);

      group.setPosition(32, 32);
      render(backend, root);

      expectPixelNear(readPixel(backend, 40, 40), [0, 255, 0, 255]);
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — child mutation inside the group is visible on the next frame', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readPixel(backend, 8, 8), [255, 0, 0, 255]);

      sprite.setPosition(24, 24);
      render(backend, root);

      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — tint/alpha change on a drawable inside the group is never served stale', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readPixel(backend, 8, 8), [255, 255, 255, 255]);

      sprite.tint = new Color(0, 255, 0);
      render(backend, root);

      expectPixelNear(readPixel(backend, 8, 8), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — bitmap text inside a moved group renders at the group position', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);
    const root = new Container();
    const group = new RetainedContainer();

    try {
      text.setPosition(8, 8); // covers (8,8)-(40,40) — same fixture/probes as webgl2-bitmap-text.test.ts
      group.addChild(text);
      root.addChild(group);

      render(backend, root); // frame 1: full collect + capture
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 38, 38), [255, 0, 0, 255]);

      // Move the group by (16, 0): text bakes group-relative vertices, so the
      // u_group uniform must lift them (spec §7 text exception) — the glyph
      // now covers (24,8)-(56,40).
      group.setPosition(16, 0);
      render(backend, root); // frame 2: spliced — the group matrix alone must relocate it

      expectPixelNear(readPixel(backend, 32, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 54, 38), [255, 0, 0, 255]);
      // The original (un-shifted) position is now background.
      expectPixelNear(readPixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — effect-bearing DIRECT child (cacheAsBitmap barrier) inside a moved group stays world-correct', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const cached = new Sprite(texture);

    try {
      // Barrier child escapes the group convention: world-space, and
      // cacheAsBitmap is visually neutral, so "semantics-neutral by
      // construction" is directly pixel-assertable: identical placement to
      // a plain sprite at the group position.
      cached.cacheAsBitmap = true;
      group.addChild(cached);
      root.addChild(group);

      group.setPosition(16, 16);
      render(backend, root);

      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]); // sprite 16..32
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 40, 40), [0, 0, 0, 255]);

      render(backend, root); // spliced frame: barrier re-dispatches, same output
      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — effect-bearing node nested TWO levels deep: the boundary disengages and output stays correct', async () => {
    const backend = await createBackend();
    const red = createSolidTexture('#ff0000', 16, 16);
    const green = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepCached = new Sprite(red);
    const plainLeaf = new Sprite(green);

    try {
      deepCached.cacheAsBitmap = true; // barrier at depth 2 -> D-P4 Option A fallback
      mid.setPosition(8, 8);
      mid.addChild(deepCached);
      group.addChild(mid);
      group.addChild(plainLeaf);
      group.setPosition(16, 16);
      root.addChild(group);

      render(backend, root);

      // CORRECT output, not a warning: the deep effect lands at its true
      // world position (16+8 -> 24..40) and the plain sibling at the group
      // position (16..32) — the disengaged group renders exactly like a
      // plain Container (group uniform identity, world-space transforms).
      expectPixelNear(readPixel(backend, 36, 36), [255, 0, 0, 255]); // deep cached sprite only
      expectPixelNear(readPixel(backend, 18, 18), [0, 255, 0, 255]); // plain leaf only
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 46, 46), [0, 0, 0, 255]);

      render(backend, root); // second frame: identical (no retention, no drift)
      expectPixelNear(readPixel(backend, 36, 36), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 18, 18), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      red.destroy();
      green.destroy();
      backend.destroy();
    }
  });

  test('cell 8 — pixelSnapMode is group-aware: a snapped sprite inside a fractional group renders through the composed path (R2)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      // Fractional group offset + fractional child: the composed device origin
      // is off-pixel. `position` snapping now composes the group matrix in
      // before snapping and peels it back off the uploaded row, so the shader's
      // re-applied u_group still lands the origin on a whole device pixel.
      group.setPosition(8.4, 8.4);
      sprite.setPosition(0.3, 0.3);
      sprite.pixelSnapMode = 'position';
      group.addChild(sprite);
      root.addChild(group);

      const worldBefore = sprite.getWorldTransform().clone();

      render(backend, root); // full collect + capture through the group + snap path
      // Composed origin ≈ 8.7 → snapped to 9; the 16px sprite covers ~9..25.
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]);

      const first = readPixel(backend, 16, 16);

      render(backend, root); // spliced frame — deterministic, no drift
      expect(readPixel(backend, 16, 16)).toEqual(first);

      // Render-only: the logical world transform is never mutated by snapping.
      expect(sprite.getWorldTransform().equals(worldBefore)).toBe(true);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
