import { defineAsset } from '@codexo/exojs';
import type { AssetHandler } from '@codexo/exojs/extensions';

import { LdtkMap } from './LdtkMap';
import { LdtkProject } from './LdtkProject';
import { loadLdtkMap } from './loadLdtkMap';
import { loadLdtkProject } from './loadLdtkProject';

/**
 * Declarative asset binding for {@link LdtkMap}.
 *
 * Claims the `ldtk` file extension so that:
 * - `loader.load(Asset.type('ldtkMap', 'world.ldtk'))` - returns the parsed
 *   {@link LdtkMap} with all levels pre-converted to runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap}s.
 * - `loader.load('world.ldtk')` - auto-routed to `LdtkMap` via
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

/**
 * Declarative asset binding for {@link LdtkProject} - the streaming entry point.
 *
 * `loader.load(Asset.type('ldtkProject', 'world.ldtk'))` returns the project's
 * world layout and tileset atlases with no level payload loaded; levels are
 * loaded and unloaded individually through
 * {@link LdtkProject.createRuntime}.
 *
 * No file extension is claimed, so `loader.load('world.ldtk')` keeps resolving
 * to the eager {@link LdtkMap} it always did. Both bindings fetch the same
 * `.ldtk` URL, and loading one does not make the other resident.
 */
export const ldtkProjectBinding = defineAsset({
  ctor: LdtkProject,
  type: 'ldtkProject',
  create() {
    return {
      async load(req, ctx) {
        return loadLdtkProject(req.source, ctx);
      },
    } satisfies AssetHandler<LdtkProject>;
  },
});
