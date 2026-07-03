/**
 * WebGPU tilemap actor-interleaving browser test (G-INTERLEAVE) — opt-in,
 * capability-aware. The parity counterpart of
 * `webgl2-tilemap-interleave.test.ts`: an application-owned sibling node placed
 * BETWEEN two `TileMapView` bands composites in document order (over the band
 * below, under the band above) on a real WebGPU backend. All WebGPU renderers
 * use inline WGSL — no shader mocks. CI guarantees a real WebGPU adapter (the
 * required Chromium-WebGPU lane runs against Mesa lavapipe); `renderScene`
 * only skips when the software adapter drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Container } from '@codexo/exojs';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createSolidTexture, makeTileset, singleTileMap, wireTilemapRenderers } from './_tilemapScene';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireTilemapRenderers(backend);

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

const RED: RgbaTuple = [255, 0, 0, 255];
const GREEN: RgbaTuple = [0, 255, 0, 255];
const BLUE: RgbaTuple = [0, 0, 255, 255];

/**
 * Build the interleave scene (parity with the WebGL2 test):
 *   worldRoot
 *    ├─ ground band   (red,   screen 0..16)   — bottom
 *    ├─ actor         (green, screen 8..24)   — app-owned sibling (middle)
 *    └─ roof band     (blue,  screen 16..32)  — top
 */
const makeInterleaveScene = () => {
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const blue = createSolidTexture('#0000ff');

  const tsRed = makeTileset(red, 'red');
  const tsBlue = makeTileset(blue, 'blue');

  const ground = new TileLayer({ id: 1, name: 'ground', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed] });
  ground.setTileAt(0, 0, { tileset: tsRed, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

  const roof = new TileLayer({ id: 2, name: 'roof', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsBlue] });
  roof.setTileAt(0, 0, { tileset: tsBlue, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

  const map = new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed, tsBlue], layers: [ground, roof] });
  const view = map.createView({ bands: { ground: ['ground'], roof: ['roof'] } });

  const actor = new TileMapNode(singleTileMap(green));
  actor.setPosition(8, 8);

  const roofBand = view.band('roof');
  roofBand.setPosition(16, 16);

  const worldRoot = new Container();
  worldRoot.addChild(view.band('ground'), actor, roofBand);

  const dispose = (): void => {
    view.destroy();
    actor.destroy();
    map.destroy();
    red.destroy();
    green.destroy();
    blue.destroy();
  };

  return { worldRoot, dispose };
};

describe('WebGPU tilemap — actor interleaving (G-INTERLEAVE)', () => {
  test('an actor sibling composites between the ground and roof bands', async ctx => {
    const backend = await setupBackend();

    const { worldRoot, dispose } = makeInterleaveScene();

    try {
      if (!(await renderScene(ctx, backend, worldRoot))) {
        return;
      }

      const at = readCanvas(backend);

      expectPixelNear(at(4, 4), RED); // ground only
      expectPixelNear(at(12, 12), GREEN); // actor over ground
      expectPixelNear(at(11, 21), GREEN); // actor only
      expectPixelNear(at(20, 20), BLUE); // roof over actor
      expectPixelNear(at(28, 28), BLUE); // roof only
    } finally {
      dispose();
      backend.destroy();
    }
  });
});
