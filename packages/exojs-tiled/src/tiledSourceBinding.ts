import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

import { loadTiledMap } from './loadTiledMap';
import { TiledMap } from './TiledMap';
import { resolveTiledOptions,type TiledLoadOptions } from './tiledOptions';

/**
 * Declarative asset binding for {@link TiledMap}.
 *
 * `loader.load(Asset.type('tiledSource', 'world.tmj'))` resolves through this
 * binding, but no `extensions` are claimed, so a plain
 * `loader.load('world.tmj')` does not resolve to `TiledMap`. The `.tmj`
 * extension (and generic `.json` Tiled loading) is reserved for the
 * format-independent `TileMap` runtime asset binding.
 *
 * The type name is `tiledSource`, not `tiledMap`: the runtime binding next to
 * it is called `tileMap`, and two descriptor strings one letter apart is a
 * typo that resolves to the wrong asset type instead of failing.
 */
export const tiledSourceBinding = defineAsset<TiledMap, TiledLoadOptions>({
  ctor: TiledMap,
  type: 'tiledSource',
  create() {
    return {
      getIdentityDiscriminator(req) {
        const o = resolveTiledOptions(req.options);
        return o.format;
      },
      async load(req, ctx) {
        return loadTiledMap(req.source, ctx);
      },
    } satisfies AssetHandler<TiledMap, TiledLoadOptions>;
  },
});
