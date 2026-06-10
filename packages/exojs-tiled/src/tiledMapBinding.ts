import type { AssetBinding, AssetHandler } from '@codexo/exojs/extensions';

import { loadTiledMap } from './loadTiledMap';
import { TiledMap } from './TiledMap';
import { type TiledLoadOptions, resolveTiledOptions } from './tiledOptions';

/**
 * Declarative asset binding for {@link TiledMap}.
 *
 * Token-only: `loader.load(TiledMap, 'world.tmj')` resolves through this
 * binding, but no `extensions` are claimed, so a plain
 * `loader.load('world.tmj')` does not resolve to `TiledMap`. The `.tmj`
 * extension (and generic `.json` Tiled loading) is reserved for the
 * format-independent `TileMap` runtime asset binding.
 */
export const tiledMapBinding = {
  type: TiledMap,
  typeNames: ['tiledMap'],
  create() {
    return {
      getIdentityKey(req) {
        const o = resolveTiledOptions(req.options);
        return `${req.source}|${o.format}|${o.strict}`;
      },
      async load(req, ctx) {
        return loadTiledMap(req.source, ctx);
      },
    } satisfies AssetHandler<TiledMap, TiledLoadOptions>;
  },
} satisfies AssetBinding<TiledMap, TiledLoadOptions>;
