/**
 * WebGL2 renderer-matrix browser tests — TileChunkNode retained instruction-set
 * replay (Track B).
 *
 * A retained group holding TileMapNode(s) whose playback was recorded replays
 * through `_replayRetainedBatch` from group-owned resources (persistent
 * instance buffer + group transform texture) and must produce BYTE-IDENTICAL
 * frames to the entry-replay slow path. A live TileMapNode OUTSIDE the group
 * keeps the group's shared transform rows starting at a non-zero frame-global
 * index, so the group-local tile-word rebase (row bits 0..28, diagonal bit 29
 * preserved) is load-bearing in every assertion: a broken rebase (or a wrong
 * byte offset) fetches the wrong / out-of-range transform row and the
 * full-canvas byte comparison fails.
 *
 * The renderer uses inline GLSL, so no shader-file mocks are required, and the
 * scene only emits TileChunkNode drawables, so no core renderers are wired.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireTilemapRenderers } from './_tilemapScene';

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

/** Full-framebuffer snapshot for byte-identical tier comparisons. */
const readCanvas = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 12): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(canvas);
};

interface Scene {
  readonly root: Container;
  readonly group: RetainedContainer;
  readonly redLayer: TileLayer;
  readonly greenLayer: TileLayer;
  readonly destroy: () => void;
}

/**
 * Standard cell scene: one live TileMapNode OUTSIDE (and before) the retained
 * group so the group's shared transform rows never start at row 0 — the
 * group-local tile-word rebase is load-bearing in every pixel assertion, and
 * the replay path interleaves with a live batch every frame.
 *
 * The group holds two 16x16 single-tile TileMapNodes with DISTINCT tileset
 * textures, so each records its own single-texture batch — exercising
 * per-batch byte offsets across more than one recorded batch (mirrors the
 * nine-slice retained-replay cells).
 *
 * Layout (canvas 64x64): blue outside tile at (48,0)-(64,16); group at
 * (8,24) with a red tile at group-local (0,0) -> world (8,24)-(24,40) and a
 * green tile at group-local (16,16) -> world (24,40)-(40,56).
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

  return { root, group, redLayer, greenLayer, destroy };
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside tile
  expectPixelNear(readPixel(backend, 12, 28), [255, 0, 0, 255]); // red tile inside the group
  expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // green tile inside the group
  expectPixelNear(readPixel(backend, 4, 60), [0, 0, 0, 255]); // background
};

describe('WebGL2 renderer matrix: TileChunkNode retained instruction-set replay cells', () => {
  test('cell 1 — the tile-chunk instruction-replay tier is byte-identical to the entry-replay and collect tiers', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      render(backend, scene.root); // F1 — full collect + fragment capture (slow tier)

      const collectFrame = readCanvas(backend);

      expectBaseScenePixels(backend);
      expect(replaySpy).not.toHaveBeenCalled();

      render(backend, scene.root); // F2 — entry replay + instruction recording

      const recordFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();

      render(backend, scene.root); // F3 — instruction splice: recorded batches replay

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();

      render(backend, scene.root); // F4 — steady state

      const steadyFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1); // never re-recorded
      expectBaseScenePixels(backend);
      expect(recordFrame).toEqual(collectFrame);
      expect(replayFrame).toEqual(recordFrame);
      expect(steadyFrame).toEqual(recordFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the replay path: live projection, no recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root);
      render(backend, scene.root);
      render(backend, scene.root);

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 36, 8), [0, 0, 255, 255]); // outside tile 32..48
      expectPixelNear(readPixel(backend, 4, 28), [255, 0, 0, 255]); // red now 0..8
      expectPixelNear(readPixel(backend, 12, 44), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readPixel(backend, 28, 28), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the replay path: one live group matrix relocates the cached tile batches', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root);
      render(backend, scene.root);
      render(backend, scene.root);

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      scene.group.setPosition(24, 8);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 28, 12), [255, 0, 0, 255]); // red 24..40 x 8..24
      expectPixelNear(readPixel(backend, 44, 28), [0, 255, 0, 255]); // green 40..56 x 24..40
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside tile unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — content mutation after capture: an edited tile is reflected, never replayed stale', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice (recorded tier active)

      // Edit a tile INSIDE the already-recorded group: clearing it must not
      // replay the stale (red) geometry — the chunk revision bump must reach
      // `_markContentDirty()` on the owning TileChunkNode so the group
      // content-dirties and re-collects instead of splicing the previous
      // instruction set. A dirty frame drops the recording but does not
      // re-arm it (record-on-first-CLEAN-frame policy), so the pixel proof
      // lands on this frame and the re-record proof lands one frame later.
      scene.redLayer.clearTileAt(0, 0);
      render(backend, scene.root); // dirty re-collect: drops the stale recording

      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]); // cleared: background, not stale red
      expectPixelNear(readPixel(backend, 28, 44), [0, 255, 0, 255]); // untouched sibling still correct
      expectPixelNear(readPixel(backend, 52, 8), [0, 0, 255, 255]); // live outside tile unaffected

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, scene.root); // clean entry-replay + re-arm record

      expect(beginSpy).toHaveBeenCalledTimes(1);

      render(backend, scene.root); // instruction splice of the NEW (post-edit) recording

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readPixel(backend, 12, 28), [0, 0, 0, 255]);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });
});
