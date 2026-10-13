/**
 * The top-down starter's authored map, rendered on a real WebGL2 backend: the
 * `.tmj` and its atlas are fetched and decoded by the real Loader through the
 * Tiled asset type, and a door edit on the `Walls` layer shows on the next
 * frame.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { tiledExtension } from '@codexo/exojs-tiled';
import { type TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import { Asset } from '#assets/Asset';
import { Loader } from '#assets/Loader';
import { textureType } from '#assets/types/image';
import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { buildSnapshot } from '#extensions/snapshot';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import type { RgbaTuple } from './_pixels';
import { wireViaTiledExtension } from './_tilemapScene';

const TILE = 64;
const ASSETS = '/packages/create-exo-app/templates/top-down/public/assets/';

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = TILE;
  canvas.height = TILE;

  const backend = new WebGl2Backend({
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: TILE, height: TILE },
      rendering: { debug: false, webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false } },
    },
  } as unknown as Application);

  await backend.initialize();
  wireViaTiledExtension(backend);

  return backend;
};

/** The pixel at the centre of map cell `(column, row)`, drawn alone into the one-tile canvas. */
const cellColor = (backend: WebGl2Backend, node: TileMapNode, column: number, row: number): RgbaTuple => {
  node.setPosition(-column * TILE, -row * TILE);
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return readWebGl2Pixel(backend, TILE / 2, TILE / 2);
};

describe('WebGL2 authored tile map', () => {
  test('renders the starter map loaded from town-square.tmj and follows a door edit on its Walls layer', async () => {
    const backend = await createBackend();
    const loader = new Loader({ basePath: ASSETS });

    loader._installAssetTypes([textureType, ...buildSnapshot([tiledExtension]).assets]);

    const map = (await loader.load(Asset.type('tileMap', 'town-square.tmj'))) as TileMap;
    const node = new TileMapNode(map);
    const walls = map.getTileLayer('Walls')!;

    try {
      const floor = cellColor(backend, node, 3, 2);
      const wall = cellColor(backend, node, 0, 0);
      const door = cellColor(backend, node, 14, 5);

      // Three different atlas tiles, so three different colours at their centres.
      expect(floor).not.toEqual(wall);
      expect(door).not.toEqual(floor);
      expect(door).not.toEqual(wall);
      expect(floor[3]).toBe(255);

      walls.clearTileAt(14, 5);
      expect(cellColor(backend, node, 14, 5)).toEqual(floor);

      walls.setTileAt(14, 5, { ...walls.getTileAt(8, 2)!, localTileId: 127 });
      expect(cellColor(backend, node, 14, 5)).toEqual(door);
      expect(cellColor(backend, node, 0, 0)).toEqual(wall);
    } finally {
      node.destroy();
      loader.destroy();
      backend.destroy();
    }
  });
});
