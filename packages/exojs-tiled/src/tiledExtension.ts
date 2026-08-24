import type { Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { tiledSourceType } from './tiledSourceType';
import { tileMapType } from './tileMapType';

/**
 * Default immutable Tiled extension descriptor.
 *
 * Installs two asset types:
 * - {@link tileMapType} - `loader.load(tileMapType.asset('world.tmj'))` returns
 *   a format-independent runtime {@link TileMap} (common case).
 * - {@link tiledSourceType} - `loader.load(tiledSourceType.asset('world.tmj'))`
 *   returns the raw parsed {@link TiledMap} source model (advanced/diagnostic).
 *
 * Depends on {@link tilemapExtension} so that snapshot construction always
 * materialises the generic tilemap runtime before the Tiled adapter.
 *
 * Pass it to the application that should have it via
 * `ApplicationOptions.extensions`.
 */
export const tiledExtension: Extension = Object.freeze({
  id: '@codexo/exojs-tiled',
  dependencies: [tilemapExtension],
  // Localized erasure cast: typed types (Options=TiledLoadOptions) meet the
  // untyped Extension.assets contract here. Runtime behavior is unaffected.
  assets: [tileMapType, tiledSourceType],
});
