/**
 * WebGL2 renderer structural cross-validation tests.
 *
 * Runs the REAL WebGl2Backend against a genuine WebGL2 context (Chromium
 * SwiftShader) and asserts the same deterministic draw-call / batching
 * invariants that the Node fake-context harness captures — proving that the
 * CPU-side renderer decisions (multi-texture slot merge, nine-slice flush
 * policy, repeating-sprite shader path, tilemap chunk pages) produce
 * identical counts under a real GPU pipeline.
 *
 * The shaderStubPlugin rewrites .vert/.frag imports to empty strings, so the
 * sprite and mesh renderer programs are compiled from the inline GLSL mocked
 * below (same attribute locations as production). NineSlice and RepeatingSprite
 * renderers use inline GLSL constants and need no mock. The tilemap renderer
 * also uses inline GLSL and requires no mock and no core-renderer wiring.
 *
 * Canvas size: 1280 × 720 — large enough that ≤200 sprites scattered inside
 * always pass view-frustum culling. Tilemap tests use a smaller canvas sized
 * to the map so the whole map is always in view.
 *
 * Run via:  pnpm test:browser:webgl2
 */

// ---------------------------------------------------------------------------
// Shader stubs (sprite + mesh + text, mirroring the production attribute
// locations so the GL program compiles and VAOs bind correctly). Must be
// hoisted so vi.mock calls are processed before imports.
// ---------------------------------------------------------------------------

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
  mat3 transform = mat3(m0.x, m0.z, 0.0, m0.y, m0.w, 0.0, m1.x, m1.y, 1.0);
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

  textVertexSource: `#version 300 es
precision mediump float;
in vec2 a_position;
in vec2 a_texcoord;
in float a_nodeIndex;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  // Keep a_nodeIndex active (× 0.0) so GLSL does not strip the attribute and
  // the text renderer's onConnect reflection finds it (mirrors the proven
  // webgl2-custom-sprite-material.test.ts text mock).
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
vi.mock('#rendering/webgl2/glsl/text.vert', () => ({ default: shaderSources.textVertexSource }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', () => ({ default: shaderSources.textFragmentSource }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', () => ({ default: shaderSources.textFragmentSource }));

// ---------------------------------------------------------------------------
// Imports (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';
import { wireTilemapRenderers } from './_tilemapScene';

// ---------------------------------------------------------------------------
// Backend factory helpers
// ---------------------------------------------------------------------------

/** Canvas width for sprite / nine-slice / repeating tests. */
const SPRITE_CANVAS_W = 1280;
/** Canvas height for sprite / nine-slice / repeating tests. */
const SPRITE_CANVAS_H = 720;

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

/**
 * Create a real WebGl2Backend + canvas, wire core renderers (Sprite, Mesh,
 * Text, NineSlice, RepeatingSprite), and resolve after `initialize()`.
 */
const createCoreBackend = async (w = SPRITE_CANVAS_W, h = SPRITE_CANVAS_H): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = w;
  canvas.height = h;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: w, height: h },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 4096,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

/**
 * Create a backend wired only for tilemap rendering (no core renderer shaders).
 * Canvas size matches the given map pixel dimensions exactly so every chunk is
 * within the viewport without needing to pan the camera.
 */
const createTilemapBackend = async (pixelW: number, pixelH: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = pixelW;
  canvas.height = pixelH;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: pixelW, height: pixelH },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireTilemapRenderers(backend);

  return backend;
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

/**
 * Execute one render frame (resetStats → clear → render → flush) and return
 * the number of draw calls recorded by the backend stats.
 */
const render = (backend: WebGl2Backend, node: { render(b: WebGl2Backend): void }): number => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return backend.stats.drawCalls;
};

// ---------------------------------------------------------------------------
// Texture factory helpers
// ---------------------------------------------------------------------------

/** Solid-colour 16×16 texture backed by a real canvas. */
const makeSolidTexture = (color: string, size = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(canvas);
};

/** Build N distinct solid-colour textures (colours cycle through a fixed palette). */
const makeTextures = (count: number, size = 16): Texture[] => {
  const colors = [
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#ffff00',
    '#ff00ff',
    '#00ffff',
    '#ffffff',
    '#888888',
    '#ff8800',
    '#00ff88',
    '#8800ff',
    '#88ff00',
    '#ff0088',
    '#0088ff',
    '#884400',
    '#004488',
  ];

  return Array.from({ length: count }, (_, i) => makeSolidTexture(colors[i % colors.length], size));
};

/**
 * Deterministically place a drawable inside the sprite canvas so it always
 * passes frustum culling. Uses coprime strides matching the Node harness fixture.
 */
const scatterInView = (node: { setPosition(x: number, y: number): void }, index: number, size = 32): void => {
  const spanX = Math.max(1, SPRITE_CANVAS_W - size);
  const spanY = Math.max(1, SPRITE_CANVAS_H - size);

  node.setPosition((index * 137) % spanX, (index * 251) % spanY);
};

// ---------------------------------------------------------------------------
// Scene builders (inline, no external fixtures dependency)
// ---------------------------------------------------------------------------

interface SpritesScene {
  readonly root: Container;
  readonly textures: readonly Texture[];
}

/**
 * Build N sprites inside the view.
 * `assign='shared'`  — all sprites share textures[0].
 * `assign='cycle'`   — textures cycled round-robin across sprites.
 * `assign='distinct'` — sprite i gets texture i (count must equal textures.length).
 */
const buildSprites = (count: number, textures: readonly Texture[], assign: 'shared' | 'cycle' | 'distinct' = 'cycle'): SpritesScene => {
  const root = new Container();

  for (let i = 0; i < count; i++) {
    const tex = assign === 'shared' ? textures[0] : textures[i % textures.length];
    const sprite = new Sprite(tex);

    scatterInView(sprite, i);
    root.addChild(sprite);
  }

  return { root, textures };
};

interface NineSliceScene {
  readonly root: Container;
  readonly textures: readonly Texture[];
}

/**
 * Build N nine-slice sprites. `assign` is the same as for sprites.
 * Uses 64×64 textures with 16px slices — the texture must be larger than
 * 2 × sliceInset (2 × 16 = 32 < 64), so the 64px atlas satisfies validation.
 * Stretch mode produces 9 quads per sprite.
 */
const buildNineSlices = (count: number, textures: readonly Texture[], assign: 'shared' | 'cycle' = 'cycle'): NineSliceScene => {
  const root = new Container();
  // NineSlice has no multi-texture merge — each texture switch flushes.
  // Pin document order so the optimizer can't coalesce same-texture sprites
  // across non-overlapping gaps, keeping draw counts independent of layout.
  root.preserveDrawOrder = true;

  for (let i = 0; i < count; i++) {
    const tex = assign === 'shared' ? textures[0] : textures[i % textures.length];
    const sprite = new NineSliceSprite(tex, {
      slices: 16,
      width: 64,
      height: 64,
      modes: { edges: 'stretch', center: 'stretch' },
    });

    scatterInView(sprite, i, 64);
    root.addChild(sprite);
  }

  return { root, textures };
};

interface RepeatingScene {
  readonly root: Container;
  readonly textures: readonly Texture[];
}

/**
 * Build N shader-path repeating sprites (bare Texture — GPU sampler wrap, one
 * instance per sprite). `assign` is the same as for sprites.
 */
const buildRepeatingShader = (count: number, textures: readonly Texture[], assign: 'shared' | 'cycle' = 'cycle'): RepeatingScene => {
  const root = new Container();
  // RepeatingSprite (shader path) has no multi-texture merge — each texture
  // switch flushes. Pin document order so the optimizer can't coalesce
  // same-texture sprites across non-overlapping gaps.
  root.preserveDrawOrder = true;

  for (let i = 0; i < count; i++) {
    const tex = assign === 'shared' ? textures[0] : textures[i % textures.length];
    // Bare Texture → shader path (GPU sampler wrap, no geometry quads).
    const sprite = new RepeatingSprite(tex, { width: 64, height: 64, modeX: 'repeat', modeY: 'repeat' });

    scatterInView(sprite, i, 64);
    root.addChild(sprite);
  }

  return { root, textures };
};

// ---------------------------------------------------------------------------
// Tilemap helpers (matching _tilemapScene.ts conventions)
// ---------------------------------------------------------------------------

const makeTileset = (texture: Texture, name = 'tiles', tileCount = 1): TileSet =>
  new TileSet({
    name,
    texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
  });

/**
 * Dense N×N map with one chunk covering the whole map.
 * Every cell is assigned to tilesets[(tx + ty) % tilesets.length] so distinct
 * tilesets are interleaved uniformly.
 */
const buildDenseTilemapNode = (
  widthTiles: number,
  heightTiles: number,
  tilesets: readonly TileSet[],
  tilesetAssign: (tx: number, ty: number) => number = () => 0,
): TileMapNode => {
  const layer = new TileLayer({
    id: 1,
    name: 'ground',
    width: widthTiles,
    height: heightTiles,
    tileWidth: 16,
    tileHeight: 16,
    // One chunk spanning the entire map so all tiles are in a single chunk node.
    chunkWidth: widthTiles,
    chunkHeight: heightTiles,
    tilesets: tilesets as TileSet[],
  });

  for (let ty = 0; ty < heightTiles; ty++) {
    for (let tx = 0; tx < widthTiles; tx++) {
      const tileset = tilesets[tilesetAssign(tx, ty) % tilesets.length];
      layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }

  const map = new TileMap({
    name: 'bench',
    width: widthTiles,
    height: heightTiles,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: tilesets as TileSet[],
    layers: [layer],
  });

  return new TileMapNode(map);
};

// ===========================================================================
// Sprite draw-call invariants
// ===========================================================================

describe('WebGL2 renderer perf — Sprite', () => {
  it('200 sprites / 1 shared texture → 1 draw (single batch)', async () => {
    const backend = await createCoreBackend();
    const textures = makeTextures(1);
    const { root } = buildSprites(200, textures, 'shared');

    try {
      expect(render(backend, root)).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });

  it('200 sprites / 8 cycled textures → 1 draw (multi-texture slot merge)', async () => {
    const backend = await createCoreBackend();
    const textures = makeTextures(8);
    const { root } = buildSprites(200, textures, 'cycle');

    try {
      expect(render(backend, root)).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });

  it('9 distinct textures → 2 draws (slot exhaustion at 9th texture)', async () => {
    const backend = await createCoreBackend();
    const textures = makeTextures(9);
    const { root } = buildSprites(9, textures, 'distinct');

    try {
      expect(render(backend, root)).toBe(2);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });

  it('17 distinct textures → 3 draws (two slot-exhaustion flushes)', async () => {
    const backend = await createCoreBackend();
    const textures = makeTextures(17);
    const { root } = buildSprites(17, textures, 'distinct');

    try {
      expect(render(backend, root)).toBe(3);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });
});

// ===========================================================================
// NineSlice draw-call invariants
// ===========================================================================

describe('WebGL2 renderer perf — NineSlice', () => {
  it('50 nine-slices / 1 shared atlas (stretch) → 1 draw (same-texture batch)', async () => {
    const backend = await createCoreBackend();
    // 64×64 textures with 16px slices (2×16=32 < 64 passes validation).
    const textures = makeTextures(1, 64);
    const { root } = buildNineSlices(50, textures, 'shared');

    try {
      expect(render(backend, root)).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });

  it('50 nine-slices / 8 cycled distinct textures → 50 draws (no multi-texture merge)', async () => {
    const backend = await createCoreBackend();
    // The nine-slice renderer is single-texture: every texture switch flushes,
    // so 50 cyclic-texture sprites → 50 separate draws. 64px textures required
    // for 16px slice validation.
    const textures = makeTextures(8, 64);
    const { root } = buildNineSlices(50, textures, 'cycle');

    try {
      expect(render(backend, root)).toBe(50);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });
});

// ===========================================================================
// RepeatingSprite draw-call invariants (shader path only)
// ===========================================================================

describe('WebGL2 renderer perf — RepeatingSprite (shader path)', () => {
  it('50 shader-path sprites / 1 texture → 1 draw', async () => {
    const backend = await createCoreBackend();
    const textures = makeTextures(1);
    const { root } = buildRepeatingShader(50, textures, 'shared');

    try {
      expect(render(backend, root)).toBe(1);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });

  it('50 shader-path sprites / 8 cycled textures → 50 draws (no multi-texture merge)', async () => {
    const backend = await createCoreBackend();
    // The repeating-sprite renderer is single-texture: every texture switch
    // flushes, so 50 cyclic-texture sprites → 50 separate draws.
    const textures = makeTextures(8);
    const { root } = buildRepeatingShader(50, textures, 'cycle');

    try {
      expect(render(backend, root)).toBe(50);
    } finally {
      root.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });
});

// ===========================================================================
// Tilemap draw-call invariants
// ===========================================================================

describe('WebGL2 renderer perf — Tilemap', () => {
  it('dense 32×32 single-tileset map in one chunk → 1 draw', async () => {
    // 32 tiles × 16 px = 512 px map; canvas matches exactly.
    const pixelSize = 32 * 16;
    const backend = await createTilemapBackend(pixelSize, pixelSize);

    // Fit the view to the map so every chunk is visible.
    backend.view.reset(pixelSize / 2, pixelSize / 2, pixelSize, pixelSize);

    const tex = makeSolidTexture('#ff0000', 256);
    const tileset = makeTileset(tex, 'tiles', 256);
    const node = buildDenseTilemapNode(32, 32, [tileset]);

    node.setPosition(0, 0);

    try {
      expect(render(backend, node)).toBe(1);
    } finally {
      node.destroy();
      tex.destroy();
      backend.destroy();
    }
  });

  it('4 interleaved tilesets in one 32×32 chunk → 4 draws (one page per tileset)', async () => {
    const pixelSize = 32 * 16;
    const backend = await createTilemapBackend(pixelSize, pixelSize);

    backend.view.reset(pixelSize / 2, pixelSize / 2, pixelSize, pixelSize);

    const textures = makeTextures(4);
    const tilesets = textures.map((t, i) => makeTileset(t, `ts${i}`, 1));

    // Assign tilesets in a (tx + ty) % 4 pattern so all four are interleaved.
    const node = buildDenseTilemapNode(32, 32, tilesets, (tx, ty) => (tx + ty) % 4);

    node.setPosition(0, 0);

    try {
      expect(render(backend, node)).toBe(4);
    } finally {
      node.destroy();
      textures.forEach(t => t.destroy());
      backend.destroy();
    }
  });
});
