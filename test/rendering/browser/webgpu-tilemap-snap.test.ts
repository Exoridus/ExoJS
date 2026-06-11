/**
 * WebGPU tilemap pixel-snapping browser tests — opt-in, capability-aware.
 *
 * Parity counterpart of `webgl2-tilemap-snap.test.ts` on the WebGPU backend.
 * Verifies that `pixelSnapMode = 'geometry'` on a {@link TileMapNode} placed
 * at a fractional world position produces no background/clear-colour gaps
 * across a chunk boundary in the rendered output.
 *
 * All WebGPU tests skip gracefully when WebGPU is unavailable (no adapter or
 * software adapter lost mid-test). The double-skip contract:
 *  1. `setupBackend` skips when navigator.gpu / requestAdapter() is absent.
 *  2. `renderScene` calls `getBackendDeviceOrSkip` (device-gone guard) and
 *     catches DOMException device-loss mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createSolidTexture, makeTileset, wireTilemapRenderers } from './_tilemapScene';
import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend | null> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');

    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');

    return null;
  }

  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireTilemapRenderers(backend);

  return backend;
};

// Read the presented WebGPU canvas back through a 2D canvas.
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

// On the software (swiftshader) adapter the WebGPU device can be dropped
// mid-test. Treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a scene inside a validation error scope.
// Returns false when the device dropped mid-test (caller should bail).
const renderScene = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  root: RenderNode,
): Promise<boolean> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return false;
  }

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

/**
 * Build a 4×1 tile map with chunkWidth=2 so the chunk seam falls at tile x=2
 * (screen x = node.x + 2*tileWidth). All tiles use a solid-colour tileset.
 * Tile pitch is 16px; the canvas is 64px wide, leaving room for the seam at
 * screen x≈32 when the node is near the origin.
 */
function buildSeamMap(texture: ReturnType<typeof createSolidTexture>): TileMap {
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

  return new TileMap({
    name: 'm',
    width: 4,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [tileset],
    layers: [layer],
  });
}

// ── pixel-snap seam tests ────────────────────────────────────────────────

describe('WebGPU tilemap pixel snapping — chunk seam', () => {
  test('geometry mode: no clear-colour gap across chunk boundary at fractional position', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const node = new TileMapNode(buildSeamMap(texture));

    try {
      // Fractional placement: without snapping, floating-point rounding can open
      // a 1-pixel gap at the chunk seam. With 'geometry' mode each chunk's origin
      // is snapped to the device-pixel grid, keeping all four tiles contiguous.
      node.setPosition(0.7, 0.7);
      node.pixelSnapMode = 'geometry';

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // The chunk seam is between tile x=1 and x=2, near screen x=32.
      // Scan a horizontal strip covering both chunks; every pixel must carry the
      // tile colour (red) — a gap would appear as the black clear colour.
      for (let x = 4; x <= 59; x++) {
        const pixel = readPixel(x, 8);

        expect(pixel[0]).toBeGreaterThan(200); // red channel present → tile, not gap
      }
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('pixelSnapMode is render-only: logical position is unchanged after render', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#00ff00');
    const node = new TileMapNode(buildSeamMap(texture));

    try {
      node.setPosition(3.14, 7.77);
      node.pixelSnapMode = 'geometry';

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      // Logical transform must not have been mutated by the render-only snap.
      expect(node.x).toBe(3.14);
      expect(node.y).toBe(7.77);
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('snapped tilemap rendering is deterministic across frames', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#0000ff');
    const node = new TileMapNode(buildSeamMap(texture));

    try {
      node.setPosition(5.5, 2.3);
      node.pixelSnapMode = 'geometry';

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const source = backend.context.canvas as HTMLCanvasElement;
      const rb1 = document.createElement('canvas');

      rb1.width = canvasSize;
      rb1.height = canvasSize;
      rb1.getContext('2d')!.drawImage(source, 0, 0);

      const first = rb1.getContext('2d')!.getImageData(0, 0, canvasSize, canvasSize).data;

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const rb2 = document.createElement('canvas');

      rb2.width = canvasSize;
      rb2.height = canvasSize;
      rb2.getContext('2d')!.drawImage(source, 0, 0);

      const second = rb2.getContext('2d')!.getImageData(0, 0, canvasSize, canvasSize).data;

      expect(Array.from(second)).toEqual(Array.from(first));
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('position mode also produces no seam gap across chunk boundary', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const node = new TileMapNode(buildSeamMap(texture));

    try {
      node.setPosition(0.7, 0.7);
      node.pixelSnapMode = 'position';

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // TileChunkNode chunk origins are integer multiples of tile pitch relative
      // to the snapped layer origin, so both modes produce no seam.
      for (let x = 4; x <= 59; x++) {
        const pixel = readPixel(x, 8);

        expect(pixel[0]).toBeGreaterThan(200);
      }
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('unsnapped tilemap at integer position renders without gaps', async ctx => {
    const backend = await setupBackend(ctx);

    if (!backend) {
      return;
    }

    const texture = createSolidTexture('#ff0000');
    const node = new TileMapNode(buildSeamMap(texture));

    try {
      // An integer position means no sub-pixel drift; no snapping needed.
      node.setPosition(0, 0);
      node.pixelSnapMode = 'none';

      if (!(await renderScene(ctx, backend, node))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(8, 8), [255, 0, 0, 255]); // chunk 0
      expectPixelNear(readPixel(32, 8), [255, 0, 0, 255]); // seam column
      expectPixelNear(readPixel(40, 8), [255, 0, 0, 255]); // chunk 1
    } finally {
      node.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
