/**
 * WebGPU tilemap chunk renderer browser tests — opt-in, capability-aware.
 *
 * The parity counterpart of `webgl2-tilemap.test.ts`: single/multi-tileset
 * rendering, all 8 tile orientations, culling, layer opacity, and one-extension
 * Tiled wiring on a real WebGPU backend. All WebGPU renderers use inline WGSL —
 * no shader mocks. CI guarantees a real WebGPU adapter (the required
 * Chromium-WebGPU lane runs against Mesa lavapipe); `renderScene` only skips
 * when the software adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createQuadrantTexture, createSolidTexture, makeTileset, singleTileMap, wireTilemapRenderers, wireViaTiledExtension } from './_tilemapScene';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const setupBackend = async (wire: (backend: WebGpuBackend) => void = wireTilemapRenderers): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wire(backend);

  return backend;
};

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 18): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

// ── basic rendering ─────────────────────────────────────────────────────

describe('WebGPU tilemap — single tile', () => {
  test('renders one tile at the node position', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000');
    const node = new TileMapNode(singleTileMap(texture));

    try {
      node.setPosition(16, 16);

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const read = readCanvas(backend);
      expectPixelNear(read(24, 24), [255, 0, 0, 255]);
      expectPixelNear(read(4, 4), [0, 0, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU tilemap — multiple tilesets', () => {
  test('renders adjacent tiles from two different tileset textures', async ctx => {
    const backend = await setupBackend();

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

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const read = readCanvas(backend);
      expectPixelNear(read(8, 8), [255, 0, 0, 255]);
      expectPixelNear(read(24, 8), [0, 0, 255, 255]);
    } finally {
      node.destroy();
      red.destroy();
      blue.destroy();
      backend.destroy();
    }
  });
});

// ── orientation (G-FLIP / G-PARITY) ──────────────────────────────────────

describe('WebGPU tilemap — tile orientation', () => {
  test('all 8 flip/diagonal orientations permute the source quadrants correctly', async ctx => {
    const backend = await setupBackend();

    const texture = createQuadrantTexture();

    const readQuadrants = async (transform = TILE_TRANSFORM_IDENTITY): Promise<RgbaTuple[][] | null> => {
      const node = new TileMapNode(singleTileMap(texture, transform));
      node.setPosition(16, 16);

      if (!(await renderScene(ctx, backend, node))) {
        node.destroy();
        return null;
      }

      const read = readCanvas(backend);
      const at = (cx: number, cy: number): RgbaTuple => read(cx ? 28 : 20, cy ? 28 : 20);
      const result = [
        [at(0, 0), at(0, 1)],
        [at(1, 0), at(1, 1)],
      ];
      node.destroy();
      return result;
    };

    try {
      const identity = await readQuadrants();

      if (!identity) {
        return;
      }

      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          for (const diagonal of [false, true]) {
            const measured = await readQuadrants({ flipX, flipY, diagonal });

            if (!measured) {
              return;
            }

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

// ── culling ──────────────────────────────────────────────────────────────

describe('WebGPU tilemap — chunk culling', () => {
  test('culls off-screen chunks and draws on-screen ones', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ff0000');
    const tileset = makeTileset(texture);
    const layer = new TileLayer({ id: 1, name: 'l', width: 8, height: 1, tileWidth: 16, tileHeight: 16, chunkWidth: 2, chunkHeight: 2, tilesets: [tileset] });
    for (let tx = 0; tx < 8; tx++) {
      layer.setTileAt(tx, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
    const map = new TileMap({ name: 'm', width: 8, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(1000, 1000);

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      expect(backend.stats.culledNodes).toBeGreaterThan(0);
      expect(backend.stats.drawCalls).toBe(0);

      node.setPosition(0, 0);

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readCanvas(backend)(8, 8), [255, 0, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── layer opacity ────────────────────────────────────────────────────────

describe('WebGPU tilemap — layer opacity', () => {
  test('applies layer opacity to the rendered tile', async ctx => {
    const backend = await setupBackend();

    const texture = createSolidTexture('#ffffff');
    const tileset = makeTileset(texture);
    const layer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], opacity: 0.5 });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
    const node = new TileMapNode(map);

    try {
      node.setPosition(16, 16);

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const pixel = readCanvas(backend)(24, 24);
      expect(pixel[0]).toBeGreaterThan(80);
      expect(pixel[0]).toBeLessThan(176);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ── one-extension Tiled wiring (G-TILED-ONE-EXTENSION) ────────────────────

describe('WebGPU tilemap — one-extension Tiled wiring', () => {
  test('extensions: [tiledExtension] makes TileMapNode render via the tilemap dependency', async ctx => {
    const backend = await setupBackend(wireViaTiledExtension);

    const texture = createSolidTexture('#00ff00');
    const node = new TileMapNode(singleTileMap(texture));

    try {
      node.setPosition(16, 16);

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      expectPixelNear(readCanvas(backend)(24, 24), [0, 255, 0, 255]);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
