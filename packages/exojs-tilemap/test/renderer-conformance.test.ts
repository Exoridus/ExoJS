/**
 * Renderer conformance for the tilemap extension's renderer binding.
 *
 * The suite is core test support and is reached by relative path, the same way
 * the format adapters reach `../../../src/extensions/snapshot`.
 *
 * `TileChunkNode` is the binding's only target and is never built directly by
 * applications: a `TileLayerNode` owns its chunk nodes, so the samples come from
 * one built here. The WebGPU half of the binding has no Node double and belongs
 * to the browser lanes.
 */
import { Texture, TextureRegion } from '@codexo/exojs';
import type { RendererBinding } from '@codexo/exojs/extensions';
import { expect } from 'vitest';

import { describeRendererConformance } from '../../../test/support/renderer-conformance';
import type { TileChunkNode } from '../src/TileChunkNode';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { tilemapExtension } from '../src/tilemapExtension';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

/** Per-tile instance capacity the extension configures the WebGL2 chunk renderer with. */
const tileBatchSize = 4096;
const tileSize = 16;
const chunkSize = 32;
/** Chunks whose combined tiles overrun the instance batch, so the overflow scenario reaches the flush boundary. */
const chunkCount = Math.ceil((tileBatchSize * 2) / (chunkSize * chunkSize));

const makeTileset = (): TileSet => {
  const atlas = 256;
  const across = Math.floor(atlas / tileSize);
  const texture = new Texture();

  texture.setSize(atlas, atlas);

  return new TileSet({
    name: 'tiles',
    texture: new TextureRegion(texture, { x: 0, y: 0, width: atlas, height: atlas }),
    tileWidth: tileSize,
    tileHeight: tileSize,
    tileCount: across * across,
  });
};

/** One dense layer, split by the layer's chunk size into `chunkCount` chunk nodes. */
const makeChunkNodes = (): readonly TileChunkNode[] => {
  const tileset = makeTileset();
  const widthTiles = chunkSize * chunkCount;
  const layer = new TileLayer({
    id: 1,
    name: 'layer',
    width: widthTiles,
    height: chunkSize,
    tileWidth: tileSize,
    tileHeight: tileSize,
    chunkWidth: chunkSize,
    chunkHeight: chunkSize,
    tilesets: [tileset],
  });

  for (let ty = 0; ty < chunkSize; ty++) {
    for (let tx = 0; tx < widthTiles; tx++) {
      layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }

  return new TileLayerNode(layer).chunkNodes;
};

const tilemapBinding = (): RendererBinding => {
  const bindings = tilemapExtension.renderers ?? [];

  expect(bindings, 'the tilemap extension must declare exactly one renderer binding').toHaveLength(1);

  return bindings[0]!;
};

describeRendererConformance('TileChunkNode', tilemapBinding(), {
  drawables: () => makeChunkNodes(),
  overflowCount: chunkCount,
});
