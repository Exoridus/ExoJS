import type { Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { ldtkMapBinding } from './ldtkBinding';

/**
 * Default immutable LDtk extension descriptor.
 *
 * Registers one asset binding:
 * - {@link ldtkMapBinding} - `loader.load(LdtkMap, 'world.ldtk')` → fetches
 *   the `.ldtk` JSON, loads all referenced tileset images, and returns a
 *   fully assembled {@link LdtkMap} with one runtime
 *   {@link import('@codexo/exojs-tilemap').TileMap} per level.
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
  assets: [ldtkMapBinding],
});
