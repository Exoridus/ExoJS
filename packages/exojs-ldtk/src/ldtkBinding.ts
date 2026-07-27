import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

import { LdtkMap } from './LdtkMap';
import { loadLdtkMap } from './loadLdtkMap';

/**
 * Declarative asset binding for {@link LdtkMap}.
 *
 * Claims the `ldtk` file extension so that:
 * - `loader.load(Asset.type('ldtkMap', 'world.ldtk'))` — returns the parsed
 *   {@link LdtkMap} with all levels pre-converted to runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap}s.
 * - `loader.load('world.ldtk')` — auto-routed to `LdtkMap` via
 *   the `ExtensionKindMap` augmentation in `public.ts` (suffix → `'ldtkMap'`).
 *
 * Each loaded level's TileMap is accessible via {@link LdtkMap.levels} or
 * {@link LdtkMap.getLevelByName}.
 */
export const ldtkMapBinding = defineAsset({
  ctor: LdtkMap,
  type: 'ldtkMap',
  extensions: ['ldtk'],
  create() {
    return {
      async load(req, ctx) {
        return loadLdtkMap(req.source, ctx);
      },
    } satisfies AssetHandler<LdtkMap>;
  },
});
