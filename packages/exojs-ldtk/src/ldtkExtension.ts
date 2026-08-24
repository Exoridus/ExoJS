import type { Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { ldtkMapBinding, ldtkProjectBinding } from './ldtkBinding';

/**
 * Default immutable LDtk extension descriptor.
 *
 * Registers two asset bindings:
 * - {@link ldtkMapBinding} - `loader.load(Asset.type('ldtkMap', 'world.ldtk'))` → fetches
 *   the `.ldtk` JSON, loads all referenced tileset images, and returns a
 *   fully assembled {@link LdtkMap} with one runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap} per level.
 * - {@link ldtkProjectBinding} - `loader.load(Asset.type('ldtkProject', 'world.ldtk'))` →
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
  assets: [ldtkMapBinding, ldtkProjectBinding],
});
