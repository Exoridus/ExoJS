/**
 * WebGPU renderer-matrix browser tests — TileChunkNode retained instruction-set
 * replay (Track B).
 *
 * The WebGPU counterpart of `webgl2-tilemap-retained-instruction-replay.test.ts`.
 * A live TileMapNode OUTSIDE (and before) the retained group keeps the group's
 * shared transform-storage rows starting at a non-zero frame-global index, and
 * the group holds two DISTINCT-texture single-tile TileMapNodes (a batch always
 * binds one tileset texture → two recorded batches). The replay tier must
 * reproduce the record frame's pixels exactly; a broken tile-word rebase (or
 * wrong byte offset) fetches the wrong / out-of-range storage row and the
 * probes diverge.
 *
 * CI guarantees a real WebGPU adapter; tests only skip when the software
 * adapter drops the device mid-test (same convention as the other WebGPU
 * browser specs).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireTilemapRenderers } from './_tilemapScene';
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

  wireTilemapRenderers(backend);
  await backend.initialize();

  return backend;
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 18): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(tolerance);
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a frame through the real plan path inside a validation error scope.
// Returns false when the device dropped mid-test (the caller should bail).
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

interface Scene {
  readonly root: Container;
  readonly group: RetainedContainer;
  readonly redLayer: TileLayer;
  readonly destroy: () => void;
}

/**
 * Mirrors the WebGL2 tile-chunk retained cells: a live blue tile OUTSIDE (and
 * before) the group at (48,0)-(64,16) keeps the group-local rebase load-
 * bearing; the group at (8,24) holds a red 16x16 tile at group-local (0,0) ->
 * world (8,24)-(24,40) and a green 16x16 tile at group-local (16,16) -> world
 * (24,40)-(40,56). Distinct tileset textures -> two recorded batches.
 */
const buildScene = (): Scene => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');

  const tsBlue = new TileSet({
    name: 'blue',
    texture: new TextureRegion(blue, { x: 0, y: 0, width: 16, height: 16 }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 1,
  });
  const tsRed = new TileSet({
    name: 'red',
    texture: new TextureRegion(red, { x: 0, y: 0, width: 16, height: 16 }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 1,
  });
  const tsGreen = new TileSet({
    name: 'green',
    texture: new TextureRegion(green, { x: 0, y: 0, width: 16, height: 16 }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 1,
  });

  const outsideLayer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsBlue] });
  outsideLayer.setTileAt(0, 0, { tileset: tsBlue, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
  const outsideMap = new TileMap({ name: 'outside', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsBlue], layers: [outsideLayer] });
  const outside = new TileMapNode(outsideMap);

  const redLayer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed] });
  redLayer.setTileAt(0, 0, { tileset: tsRed, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
  const redMap = new TileMap({ name: 'red', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsRed], layers: [redLayer] });
  const redNode = new TileMapNode(redMap);

  const greenLayer = new TileLayer({ id: 1, name: 'l', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsGreen] });
  greenLayer.setTileAt(0, 0, { tileset: tsGreen, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
  const greenMap = new TileMap({ name: 'green', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tsGreen], layers: [greenLayer] });
  const greenNode = new TileMapNode(greenMap);

  const root = new Container();
  const group = new RetainedContainer();

  outside.setPosition(48, 0);
  root.addChild(outside);

  redNode.setPosition(0, 0);
  greenNode.setPosition(16, 16);
  group.addChild(redNode);
  group.addChild(greenNode);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redLayer, destroy };
};

describe('WebGPU renderer matrix: TileChunkNode retained instruction replay cells', () => {
  test('cell 1 — tile-chunk replay is pixel-identical to the record frame (fast/slow equivalence)', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      if (!(await renderScene(ctx, backend, scene.root))) {
        return; // F1
      }

      if (!(await renderScene(ctx, backend, scene.root))) {
        return; // F2: record
      }

      const probes: ReadonlyArray<readonly [number, number, RgbaTuple]> = [
        [56, 8, [0, 0, 255, 255]], // live outside tile
        [16, 32, [255, 0, 0, 255]], // red tile (batch 1)
        [32, 48, [0, 255, 0, 255]], // green tile (batch 2)
      ];
      let readPixel = readCanvas(backend);
      const slowPixels = probes.map(([x, y]) => readPixel(x, y));

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(slowPixels[i]!, probes[i]![2]);
      }

      if (!(await renderScene(ctx, backend, scene.root))) {
        return; // F3: instruction replay
      }

      readPixel = readCanvas(backend);

      for (let i = 0; i < probes.length; i++) {
        expectPixelNear(readPixel(probes[i]![0], probes[i]![1]), slowPixels[i]!, 0);
      }

      expectPixelNear(readPixel(4, 60), [0, 0, 0, 255]); // background stays clear
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the cached path: replayed tile pixels track the live view', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 8), [0, 0, 255, 255]); // outside tile 32..48
      expectPixelNear(readPixel(4, 32), [255, 0, 0, 255]); // red now 0..8 visible
      expectPixelNear(readPixel(12, 48), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the cached path relocates tile pixels WITHOUT recapture', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      scene.group.setPosition(32, 32);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(40, 40), [255, 0, 0, 255]); // red 32..48 x 32..48
      expectPixelNear(readPixel(56, 56), [0, 255, 0, 255]); // green 48..64 x 48..64
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(56, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — content mutation after capture: an edited tile is reflected, never replayed stale', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderScene(ctx, backend, scene.root))) {
          return;
        }
      }

      let readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [255, 0, 0, 255]);

      // Edit a tile INSIDE the already-recorded group: the chunk revision bump
      // must reach `_markContentDirty()` on the owning TileChunkNode, so the
      // group content-dirties and re-records instead of splicing stale bytes.
      scene.redLayer.clearTileAt(0, 0);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return;
      }

      readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]); // cleared: background, not stale red
      expectPixelNear(readPixel(32, 48), [0, 255, 0, 255]); // untouched sibling still correct
      expectPixelNear(readPixel(56, 8), [0, 0, 255, 255]); // live outside tile unaffected

      // Record-on-first-CLEAN-frame policy: the dirty frame above dropped the
      // stale recording but did not re-arm it; the re-record proof lands here.
      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      if (!(await renderScene(ctx, backend, scene.root))) {
        return; // clean entry-replay + re-arm record
      }

      expect(beginSpy).toHaveBeenCalledTimes(1);

      if (!(await renderScene(ctx, backend, scene.root))) {
        return; // instruction splice of the NEW (post-edit) recording
      }

      expect(replaySpy).toHaveBeenCalled();
      readPixel = readCanvas(backend);
      expectPixelNear(readPixel(16, 32), [0, 0, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });
});
