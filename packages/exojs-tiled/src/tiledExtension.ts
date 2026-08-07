import type { AssetBinding, Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { tiledMapBinding } from './tiledMapBinding';
import { tiledRuntimeMapBinding } from './tiledRuntimeMapBinding';

/**
 * Default immutable Tiled extension descriptor.
 *
 * Registers two asset bindings:
 * - {@link tiledRuntimeMapBinding} — `loader.load(Asset.type('tileMap', 'world.tmj'))` →
 *   returns a format-independent runtime {@link TileMap} (common case).
 * - {@link tiledMapBinding} — `loader.load(Asset.type('tiledMap', 'world.tmj'))` →
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
  // Localized erasure cast: typed bindings (Options=TiledLoadOptions) meet the
  // untyped Extension.assets contract here. Runtime behavior is unaffected —
  // materializeAssetBindings calls create() and bindAsset() correctly regardless
  // of the erased Options type.
  assets: [tiledRuntimeMapBinding, tiledMapBinding] as unknown as AssetBinding[],
});
