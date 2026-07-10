import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

import { LdtkMap } from './LdtkMap';
import { loadLdtkMap } from './loadLdtkMap';

/**
 * Declarative asset binding for {@link LdtkMap}.
 *
 * Claims the `ldtk` file extension so that:
 * - `loader.load(LdtkMap, 'world.ldtk')` — returns the parsed
 *   {@link LdtkMap} with all levels pre-converted to runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap}s.
 * - `loader.load('world.ldtk')` — auto-routed to `LdtkMap` via
 *   the `ExtensionTypeMap` augmentation in `public.ts`.
 *
 * Each loaded level's TileMap is accessible via {@link LdtkMap.levels} or
 * {@link LdtkMap.getLevelByName}.
 */
export const ldtkMapBinding = defineAsset({
  type: LdtkMap,
  kind: 'ldtkMap',
  extensions: ['ldtk'],
  create() {
    return {
      async load(req, ctx) {
        return loadLdtkMap(req.source, ctx);
      },
    } satisfies AssetHandler<LdtkMap>;
  },
});
