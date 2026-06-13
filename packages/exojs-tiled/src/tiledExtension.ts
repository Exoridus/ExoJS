import type { AssetBinding, Extension } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';

import { tiledMapBinding } from './tiledMapBinding';
import { tiledRuntimeMapBinding } from './tiledRuntimeMapBinding';

/**
 * Default immutable Tiled extension descriptor.
 *
 * Registers two asset bindings:
 * - {@link tiledRuntimeMapBinding} — `loader.load(TileMap, 'world.tmj')` →
 *   returns a format-independent runtime {@link TileMap} (common case).
 * - {@link tiledMapBinding} — `loader.load(TiledMap, 'world.tmj')` →
 *   returns the raw parsed {@link TiledMap} source model (advanced/diagnostic).
 *
 * Depends on {@link tilemapExtension} so that snapshot construction always
 * materialises the generic tilemap runtime before the Tiled adapter.
 *
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-tiled/register'` for global auto-registration.
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
