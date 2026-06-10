import { describe, expect, it } from 'vitest';

import { TileLayer, TileLayerNode, TileMap, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import * as tiled from '../src/public';

// G-PKG-IDENTITY / G-PKG-FACADE: the Tiled package re-exports the *same* runtime
// class bindings as @codexo/exojs-tilemap (not copies), so `instanceof` and
// renderer registration hold across both import paths.
describe('@codexo/exojs-tiled runtime facade', () => {
  it('re-exports the same class identities as @codexo/exojs-tilemap', () => {
    expect(tiled.TileMap).toBe(TileMap);
    expect(tiled.TileMapNode).toBe(TileMapNode);
    expect(tiled.TileLayerNode).toBe(TileLayerNode);
    expect(tiled.TileLayer).toBe(TileLayer);
    expect(tiled.TileSet).toBe(TileSet);
  });

  it('an instance built through the facade is instanceof the canonical class', () => {
    const map = new tiled.TileMap({ name: 'm', width: 2, height: 2, tileWidth: 16, tileHeight: 16 });
    const node = new tiled.TileMapNode(map);

    expect(map).toBeInstanceOf(TileMap);
    expect(node).toBeInstanceOf(TileMapNode);

    node.destroy();
  });

  it('the Tiled extension depends on the tilemap extension (one-extension rendering)', () => {
    expect(tiled.tiledExtension.dependencies).toContain(tiled.tilemapExtension);
    expect(tiled.tilemapExtension.renderers).toBeDefined();
  });
});
