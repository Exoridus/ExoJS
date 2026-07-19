/**
 * WebGL2 tilemap pixel-snapping browser tests.
 *
 * Verifies that setting `pixelSnapMode = PixelSnapMode.Geometry` on a {@link TileMapNode}
 * placed at a fractional world position produces no background/clear-colour
 * gaps across a chunk boundary in the rendered output. The snapping benefit is
 * that tile chunk origins are snapped to the device-pixel grid, keeping
 * adjacent chunks exactly contiguous even when the map's anchor lands on a
 * sub-pixel boundary.
 *
 * The tilemap renderer uses inline GLSL, so no shader-file mocks are required.
 * Only the tilemap renderer binding is wired (no core renderers needed).
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createSolidTexture, makeTileset, wireTilemapRenderers } from './_tilemapScene';

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
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireTilemapRenderers(backend);

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

/**
 * Build a 4×1 tile map with chunkWidth=2 so the chunk seam falls at tile x=2
 * (screen x = node.x + 2*tileWidth). All tiles use a solid-colour tileset.
 * Tile pitch is 16px; the canvas is 64px wide, leaving room for the seam at
 * screen x≈32 when the node is near the origin.
 */
function buildSeamMap(texture: ReturnType<typeof createSolidTexture>): { map: TileMap; tileset: ReturnType<typeof makeTileset> } {
  const tileset = makeTileset(texture);
  const layer = new TileLayer({
    id: 1,
    name: 'ground',
    width: 4,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    chunkWidth: 2,
    chunkHeight: 2,
    tilesets: [tileset],
  });

  for (let tx = 0; tx < 4; tx++) {
    layer.setTileAt(tx, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
  }

  const map = new TileMap({
    name: 'm',
    width: 4,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [tileset],
    layers: [layer],
  });

  return { map, tileset };
}

// ── pixel-snap seam tests ────────────────────────────────────────────────

describe('WebGL2 tilemap pixel snapping — chunk seam', () => {
  test('geometry mode: no clear-colour gap across chunk boundary at fractional position', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const { map } = buildSeamMap(texture);
    const node = new TileMapNode(map);

    try {
      // Fractional placement: the node's world position is not on the device-pixel
      // grid, so without snapping floating-point rounding can open a 1-pixel gap
      // at the chunk seam. With 'geometry' mode each chunk's origin is snapped,
      // keeping all four tiles contiguous.
      node.setPosition(0.7, 0.7);
      node.pixelSnapMode = PixelSnapMode.Geometry;

      render(backend, node);

      // The chunk seam is between tile x=1 and x=2, i.e. near screen x=32.
      // Scan a horizontal strip covering both chunks; every pixel must carry the
      // tile colour (red) — a gap would appear as the black clear colour.
      for (let x = 4; x <= 59; x++) {
        const pixel = readPixel(backend, x, 8);

        expect(pixel[0]).toBeGreaterThan(200); // red channel present → tile, not gap
      }
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('pixelSnapMode is render-only: logical position is unchanged after render', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00');
    const { map } = buildSeamMap(texture);
    const node = new TileMapNode(map);

    try {
      node.setPosition(3.14, 7.77);
      node.pixelSnapMode = PixelSnapMode.Geometry;

      render(backend, node);

      // Logical transform must not have been mutated by the render-only snap.
      expect(node.x).toBe(3.14);
      expect(node.y).toBe(7.77);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('snapped tilemap rendering is deterministic across frames', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff');
    const { map } = buildSeamMap(texture);
    const node = new TileMapNode(map);

    try {
      node.setPosition(5.5, 2.3);
      node.pixelSnapMode = PixelSnapMode.Geometry;

      render(backend, node);

      const buf1 = new Uint8Array(canvasSize * canvasSize * 4);

      backend.context.readPixels(0, 0, canvasSize, canvasSize, backend.context.RGBA, backend.context.UNSIGNED_BYTE, buf1);

      render(backend, node);

      const buf2 = new Uint8Array(canvasSize * canvasSize * 4);

      backend.context.readPixels(0, 0, canvasSize, canvasSize, backend.context.RGBA, backend.context.UNSIGNED_BYTE, buf2);

      expect(Array.from(buf2)).toEqual(Array.from(buf1));
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('position mode also produces no seam gap across chunk boundary', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const { map } = buildSeamMap(texture);
    const node = new TileMapNode(map);

    try {
      node.setPosition(0.7, 0.7);
      node.pixelSnapMode = PixelSnapMode.Position;

      render(backend, node);

      // TileChunkNode chunk origins are integer multiples of tile pitch relative
      // to the snapped layer origin, so both modes produce no seam.
      for (let x = 4; x <= 59; x++) {
        const pixel = readPixel(backend, x, 8);

        expect(pixel[0]).toBeGreaterThan(200);
      }
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('unsnapped tilemap at integer position renders without gaps', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const { map } = buildSeamMap(texture);
    const node = new TileMapNode(map);

    try {
      // An integer position means no sub-pixel drift; no snapping needed.
      node.setPosition(0, 0);
      node.pixelSnapMode = PixelSnapMode.None;

      render(backend, node);

      expectPixelNear(readPixel(backend, 8, 8), [255, 0, 0, 255]); // chunk 0
      expectPixelNear(readPixel(backend, 32, 8), [255, 0, 0, 255]); // seam column
      expectPixelNear(readPixel(backend, 40, 8), [255, 0, 0, 255]); // chunk 1
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
