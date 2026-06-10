import type { AssetBinding, AssetHandler, AssetLoadRequest } from '@codexo/exojs/extensions';

import { loadTiledMap } from './loadTiledMap';
import { TiledMap } from './TiledMap';

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
  create(): AssetHandler<TiledMap> {
    return {
      async load({ source }: AssetLoadRequest, context): Promise<TiledMap> {
        return loadTiledMap(source, context);
      },
    };
  },
} satisfies AssetBinding<TiledMap>;
