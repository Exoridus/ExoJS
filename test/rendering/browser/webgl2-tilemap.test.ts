/**
 * WebGL2 tilemap chunk renderer browser tests.
 *
 * Exercises the @codexo/exojs-tilemap renderer end-to-end on a real WebGL2
 * backend: single/multi-tileset rendering, all 8 tile orientations, chunk
 * boundaries, chunk-level culling, layer opacity, and the one-extension Tiled
 * wiring (`extensions: [tiledExtension]` pulls in the renderer transitively).
 *
 * The renderer uses inline GLSL, so no shader-file mocks are required, and the
 * scene only emits TileChunkNode drawables, so no core renderers are wired.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { TILE_TRANSFORM_IDENTITY,TileLayer, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import {
  createQuadrantTexture,
  createSolidTexture,
  makeTileset,
  singleTileMap,
  wireTilemapRenderers,
  wireViaTiledExtension,
} from './_tilemapScene';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const createBackend = async (wire: (backend: WebGl2Backend) => void = wireTilemapRenderers): Promise<WebGl2Backend> => {
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
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wire(backend);

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

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

// ── basic rendering ─────────────────────────────────────────────────────

describe('WebGL2 tilemap — single tile', () => {
  test('renders one tile at the node position', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const node = new TileMapNode(singleTileMap(texture));

    try {
      node.setPosition(16, 16); // tile spans screen (16,16)..(32,32)
      render(backend, node);

      expectPixelNear(readPixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 4, 4), [0, 0, 0, 255]);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 tilemap — multiple tilesets', () => {
  test('renders adjacent tiles from two different tileset textures', async () => {
    const backend = await createBackend();
    const red = createSolidTexture('#ff0000');
    const blue = createSolidTexture('#0000ff');
    const tsRed = makeTileset(red, 'red');
    const tsBlue = makeTileset(blue, 'blue');

    const layer = new TileLayer({ id: 1, name: 'l', width: 2, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed, tsBlue] });
    layer.setTileAt(0, 0, { tileset: tsRed, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: tsBlue, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const map = new TileMap({ name: 'm', width: 2, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed, tsBlue], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(0, 0);
      render(backend, node);

      expectPixelNear(readPixel(backend, 8, 8), [255, 0, 0, 255]); // first cell red
      expectPixelNear(readPixel(backend, 24, 8), [0, 0, 255, 255]); // second cell blue
    } finally {
      node.destroy();
      red.destroy();
      blue.destroy();
      backend.destroy();
    }
  });
});

// ── orientation (G-FLIP) ─────────────────────────────────────────────────

describe('WebGL2 tilemap — tile orientation', () => {
  // Quadrant centres on screen for a tile placed at (16,16): corner (cx,cy)
  // maps to screen (cx ? 28 : 20, cy ? 28 : 20).
  const readQuadrants = (backend: WebGl2Backend, texture: Texture, transform = TILE_TRANSFORM_IDENTITY): RgbaTuple[][] => {
    const node = new TileMapNode(singleTileMap(texture, transform));
    node.setPosition(16, 16);
    render(backend, node);
    const read = (cx: number, cy: number): RgbaTuple => readPixel(backend, cx ? 28 : 20, cy ? 28 : 20);
    const result = [
      [read(0, 0), read(0, 1)],
      [read(1, 0), read(1, 1)],
    ];
    node.destroy();
    return result;
  };

  test('all 8 flip/diagonal orientations permute the source quadrants correctly (G-FLIP)', async () => {
    const backend = await createBackend();
    const texture = createQuadrantTexture();

    try {
      // Identity establishes the on-screen source-corner → colour mapping
      // (absorbing any texture flipY), so the assertions stay flipY-agnostic.
      const identity = readQuadrants(backend, texture);

      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          for (const diagonal of [false, true]) {
            const measured = readQuadrants(backend, texture, { flipX, flipY, diagonal });

            for (const cx of [0, 1]) {
              for (const cy of [0, 1]) {
                let su = cx;
                let sv = cy;
                if (diagonal) {
                  const t = su;
                  su = sv;
                  sv = t;
                }
                if (flipX) su = 1 - su;
                if (flipY) sv = 1 - sv;

                expectPixelNear(measured[cx][cy], identity[su][sv]);
              }
            }
          }
        }
      }
    } finally {
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── chunk boundary ───────────────────────────────────────────────────────

describe('WebGL2 tilemap — chunk boundary', () => {
  test('renders tiles spanning two chunks with no gap at the seam', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const tileset = makeTileset(texture);
    // chunkWidth 2 → cells (0,1) and (2,3) live in different chunks.
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 1, tileWidth: 16, tileHeight: 16, chunkWidth: 2, chunkHeight: 2, tilesets: [tileset] });
    for (let tx = 0; tx < 4; tx++) {
      layer.setTileAt(tx, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
    const map = new TileMap({ name: 'm', width: 4, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(0, 0);
      render(backend, node);

      // Chunk boundary is at tile x=2 → screen x=32. No seam: both sides red.
      expectPixelNear(readPixel(backend, 24, 8), [255, 0, 0, 255]); // chunk 0
      expectPixelNear(readPixel(backend, 32, 8), [255, 0, 0, 255]); // seam
      expectPixelNear(readPixel(backend, 40, 8), [255, 0, 0, 255]); // chunk 1
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── culling ──────────────────────────────────────────────────────────────

describe('WebGL2 tilemap — chunk culling', () => {
  test('culls off-screen chunks and draws on-screen ones', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const tileset = makeTileset(texture);
    // 8 tiles wide, chunkWidth 2 → 4 chunks at screen x 0,32,64,96.
    const layer = new TileLayer({ id: 1, name: 'l', width: 8, height: 1, tileWidth: 16, tileHeight: 16, chunkWidth: 2, chunkHeight: 2, tilesets: [tileset] });
    for (let tx = 0; tx < 8; tx++) {
      layer.setTileAt(tx, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
    const map = new TileMap({ name: 'm', width: 8, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      // Fully off-screen → all 4 chunks culled, nothing drawn.
      node.setPosition(1000, 1000);
      render(backend, node);
      expect(backend.stats.culledNodes).toBeGreaterThan(0);
      expect(backend.stats.drawCalls).toBe(0);
      expectPixelNear(readPixel(backend, 8, 8), [0, 0, 0, 255]);

      // On-screen → chunks at x≥64 are off the 64px canvas and culled, but the
      // visible chunks render.
      node.setPosition(0, 0);
      render(backend, node);
      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expect(backend.stats.culledNodes).toBeGreaterThan(0); // chunks 2 & 3 off-screen
      expectPixelNear(readPixel(backend, 8, 8), [255, 0, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── layer opacity ────────────────────────────────────────────────────────

describe('WebGL2 tilemap — layer opacity', () => {
  test('applies layer opacity to the rendered tile', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff');
    const tileset = makeTileset(texture);
    const layer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], opacity: 0.5 });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(16, 16);
      render(backend, node);

      // White tile at opacity 0.5 over black ≈ mid grey.
      const pixel = readPixel(backend, 24, 24);
      expect(pixel[0]).toBeGreaterThan(96);
      expect(pixel[0]).toBeLessThan(160);
      expect(pixel[1]).toBeGreaterThan(96);
      expect(pixel[2]).toBeGreaterThan(96);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an invisible layer renders nothing', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const tileset = makeTileset(texture);
    const layer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], visible: false });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(16, 16);
      render(backend, node);

      expectPixelNear(readPixel(backend, 24, 24), [0, 0, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── capacity overflow ────────────────────────────────────────────────────

describe('WebGL2 tilemap — batch capacity overflow', () => {
  test('renders a single chunk whose tile count exceeds the batch buffer', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 1);
    const tileset = new TileSet({
      name: 'big',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: 1, height: 1 }),
      tileWidth: 1,
      tileHeight: 1,
      tileCount: 1,
    });
    // One 128×128 chunk → 16384 tiles in a single page, far beyond the 4096
    // instance batch → the renderer must flush in runs without overflowing.
    const layer = new TileLayer({ id: 1, name: 'l', width: 128, height: 128, tileWidth: 1, tileHeight: 1, chunkWidth: 128, chunkHeight: 128, tilesets: [tileset] });
    layer.fillRect(0, 0, 128, 128, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'm', width: 128, height: 128, tileWidth: 1, tileHeight: 1, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(0, 0);

      expect(() => render(backend, node)).not.toThrow();
      // The visible portion is fully covered — no gaps from the run boundaries.
      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readPixel(backend, 48, 48), [255, 0, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── one-extension Tiled wiring (G-TILED-ONE-EXTENSION) ────────────────────

describe('WebGL2 tilemap — one-extension Tiled wiring', () => {
  test('extensions: [tiledExtension] makes TileMapNode render via the tilemap dependency', async () => {
    const backend = await createBackend(wireViaTiledExtension);
    const texture = createSolidTexture('#00ff00');
    const node = new TileMapNode(singleTileMap(texture));

    try {
      node.setPosition(16, 16);
      render(backend, node);

      expectPixelNear(readPixel(backend, 24, 24), [0, 255, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
