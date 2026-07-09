import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';
import { TileMap } from '@codexo/exojs-tilemap';

import { TiledMap } from './TiledMap';
import { resolveTiledOptions,type TiledLoadOptions } from './tiledOptions';

/**
 * Declarative asset binding for the runtime {@link TileMap} produced from a
 * `.tmj` Tiled map file.
 *
 * This is the common-case binding: `loader.load(TileMap, 'world.tmj')` fetches
 * and validates the TMJ, resolves external `.tsj` tilesets, loads tileset
 * textures via the sub-load `loader.load(TiledMap, source)`, and synchronously
 * converts the parsed {@link TiledMap} source model into a format-independent
 * runtime {@link TileMap} via {@link TiledMap.toTileMap}.
 *
 * The sub-load flow guarantees that calling both `load(TileMap)` and
 * `load(TiledMap)` for the same URL shares the Loader's cached `TiledMap`
 * (no duplicate JSON fetches).
 *
 * Claiming the `tmj` extension enables the auto-routing shorthand
 * `loader.load('world.tmj')` — the {@link ExtensionTypeMap} augmentation in
 * this package maps `'tmj' → TileMap`.
 */
export const tiledRuntimeMapBinding = defineAsset<TileMap, TiledLoadOptions>({
  type: TileMap,
  kind: 'tileMap',
  extensions: ['tmj'],
  create() {
    return {
      getIdentityKey(req) {
        const o = resolveTiledOptions(req.options);
        return `${req.source}|${o.format}`;
      },
      async load(req, ctx) {
        const tiledMap = await ctx.loader.load(TiledMap.of(req.source, req.options));
        return tiledMap.toTileMap();
      },
    } satisfies AssetHandler<TileMap, TiledLoadOptions>;
  },
});
