/**
 * WebGL2 tilemap actor-interleaving browser test (G-INTERLEAVE).
 *
 * Proves on a real WebGL2 backend that an application-owned sibling node placed
 * BETWEEN two `TileMapView` bands composites in document order: it draws over
 * the band below it and under the band above it. The "actor" here is a
 * distinctly-coloured single-tile node standing in for any application
 * `RenderNode` — interleaving is a document-order property of sibling subtrees,
 * independent of the actor's concrete type, and uses only the tilemap renderer
 * (no core-renderer wiring, no shader mocks).
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Container } from '@codexo/exojs';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createSolidTexture, makeTileset, singleTileMap, wireTilemapRenderers } from './_tilemapScene';

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

const RED: RgbaTuple = [255, 0, 0, 255];
const GREEN: RgbaTuple = [0, 255, 0, 255];
const BLUE: RgbaTuple = [0, 0, 255, 255];

/**
 * Build the interleave scene:
 *   worldRoot
 *    ├─ ground band   (red,   screen 0..16)      — drawn first  (bottom)
 *    ├─ actor         (green, screen 8..24)      — app-owned sibling (middle)
 *    └─ roof band     (blue,  screen 16..32)     — drawn last   (top)
 * The three overlap diagonally so each pairwise overlap reveals draw order.
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

  const groundBand = view.band('ground'); // at origin
  const roofBand = view.band('roof');
  roofBand.setPosition(16, 16);

  const worldRoot = new Container();
  worldRoot.addChild(groundBand, actor, roofBand);

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

describe('WebGL2 tilemap — actor interleaving (G-INTERLEAVE)', () => {
  test('an actor sibling composites between the ground and roof bands', async () => {
    const backend = await createBackend();
    const { worldRoot, dispose } = makeInterleaveScene();

    try {
      render(backend, worldRoot);

      // Ground only (top-left corner): red shows through.
      expectPixelNear(readPixel(backend, 4, 4), RED);

      // Ground ∩ actor: the actor sibling draws OVER the band below it.
      expectPixelNear(readPixel(backend, 12, 12), GREEN);

      // Actor only (no band covers it): green.
      expectPixelNear(readPixel(backend, 11, 21), GREEN);

      // Actor ∩ roof: the roof band draws OVER the actor.
      expectPixelNear(readPixel(backend, 20, 20), BLUE);

      // Roof only (bottom-right): blue.
      expectPixelNear(readPixel(backend, 28, 28), BLUE);

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
    } finally {
      dispose();
      backend.destroy();
    }
  });

  test('reordering the actor after the roof band draws it on top everywhere', async () => {
    const backend = await createBackend();
    const { worldRoot, dispose } = makeInterleaveScene();

    try {
      // Move the actor to the end of the document order (above the roof band).
      const actor = worldRoot.children[1];
      worldRoot.removeChild(actor);
      worldRoot.addChild(actor);

      render(backend, worldRoot);

      // Now the actor is topmost where it overlaps the roof band.
      expectPixelNear(readPixel(backend, 20, 20), GREEN);
    } finally {
      dispose();
      backend.destroy();
    }
  });
});
