import type { AssetBinding, AssetHandler, AssetLoadRequest } from '@codexo/exojs/extensions';
import { TileMap } from '@codexo/exojs-tilemap';

import { loadTiledMap } from './loadTiledMap';

/**
 * Declarative asset binding for the runtime {@link TileMap} produced from a
 * `.tmj` Tiled map file.
 *
 * This is the common-case binding: `loader.load(TileMap, 'world.tmj')` fetches
 * and validates the TMJ, resolves external `.tsj` tilesets, loads tileset
 * textures, and converts the parsed {@link TiledMap} source model into a
 * format-independent runtime {@link TileMap} via {@link TiledMap.toTileMap}.
 *
 * Claiming the `tmj` extension enables the auto-routing shorthand
 * `loader.load('world.tmj')` once the {@link ExtensionTypeMap} augmentation
 * maps `'tmj' → TileMap` (Phase C2).
 */
export const tiledRuntimeMapBinding = {
  type: TileMap,
  typeNames: ['tileMap'],
  extensions: ['tmj'],
  create(): AssetHandler<TileMap> {
    return {
      async load({ source }: AssetLoadRequest, context): Promise<TileMap> {
        const tiledMap = await loadTiledMap(source, context);
        return tiledMap.toTileMap();
      },
    };
  },
} satisfies AssetBinding<TileMap>;
