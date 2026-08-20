/**
 * Tilemap scenes.
 *
 * The tilemap renderer lives in an extension package, so this is the first
 * scene family that has to register anything: without `wireRenderers` the node
 * draws nothing at all, and every comparison would pass on two empty frames.
 *
 * A tile layer is an instanced draw with per-tile UV offsets, which is a
 * different code path from a plain sprite on both backends - and the one place
 * a half-texel offset shows up as visible seams between tiles.
 */

import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode } from '@codexo/exojs-tilemap';

import { Container } from '#rendering/Container';

import { buildCoordinateTexture } from '../../browser/_selfDescribingFixture';
import { makeTileset, wireTilemapRenderers } from '../../browser/_tilemapScene';
import type { Scene } from '../types';

const TILE = 16;
const CANVAS = 64;

/** A 2×2 layer of the same tile: adjacent tiles must not bleed into each other. */
const tiledLayer = (): Container => {
  const root = new Container();
  const tileset = makeTileset(buildCoordinateTexture(TILE));
  const layer = new TileLayer({ id: 1, name: 'ground', width: 2, height: 2, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset] });

  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      layer.setTileAt(x, y, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }

  const map = new TileMap({ name: 'm', width: 2, height: 2, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset], layers: [layer] });
  const node = new TileMapNode(map);

  node.setPosition(8, 8);
  root.addChild(node);

  return root;
};

export const tilemapScenes: readonly Scene[] = [
  {
    name: 'tilemap/two-by-two',
    feature: 'Tilemap',
    size: CANVAS,
    fixture: 'self-describing',
    nearestSampled: true,
    wireRenderers: wireTilemapRenderers,
    build: tiledLayer,
  },
];
