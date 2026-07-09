import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

import { loadTiledMap } from './loadTiledMap';
import { TiledMap } from './TiledMap';
import { resolveTiledOptions,type TiledLoadOptions } from './tiledOptions';

/**
 * Declarative asset binding for {@link TiledMap}.
 *
 * Token-only: `loader.load(TiledMap, 'world.tmj')` resolves through this
 * binding, but no `extensions` are claimed, so a plain
 * `loader.load('world.tmj')` does not resolve to `TiledMap`. The `.tmj`
 * extension (and generic `.json` Tiled loading) is reserved for the
 * format-independent `TileMap` runtime asset binding.
 */
export const tiledMapBinding = defineAsset<TiledMap, TiledLoadOptions>({
  type: TiledMap,
  kind: 'tiledMap',
  create() {
    return {
      getIdentityKey(req) {
        const o = resolveTiledOptions(req.options);
        return `${req.source}|${o.format}`;
      },
      async load(req, ctx) {
        return loadTiledMap(req.source, ctx);
      },
    } satisfies AssetHandler<TiledMap, TiledLoadOptions>;
  },
});
