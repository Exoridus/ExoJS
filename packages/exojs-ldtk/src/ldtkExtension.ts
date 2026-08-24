import type { Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { ldtkMapType, ldtkProjectType } from './ldtkTypes';

/**
 * Default immutable LDtk extension descriptor.
 *
 * Installs two asset types:
 * - {@link ldtkMapType} - `loader.load(ldtkMapType.asset('world.ldtk'))` reads
 *   the `.ldtk` document, loads all referenced tileset images, and returns a
 *   fully assembled {@link LdtkMap} with one runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap} per level.
 * - {@link ldtkProjectType} - `loader.load(ldtkProjectType.asset('world.ldtk'))`
 *   returns the world layout and tileset atlases only, for games that load
 *   levels on demand.
 *
 * Depends on {@link tilemapExtension} so that snapshot construction always
 * materialises the generic tilemap runtime before the LDtk adapter.
 *
 * Pass it to the application that should have it via
 * `ApplicationOptions.extensions`.
 */
export const ldtkExtension: Extension = Object.freeze({
  id: '@codexo/exojs-ldtk',
  dependencies: [tilemapExtension],
  assets: [ldtkMapType, ldtkProjectType],
});
