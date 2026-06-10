import { tilemapExtension } from '@codexo/exojs-tilemap';
import type { Extension } from '@codexo/exojs/extensions';

import { tiledMapBinding } from './tiledMapBinding';

/**
 * Default immutable Tiled extension descriptor.
 *
 * Depends on {@link tilemapExtension} (the generic tilemap runtime) so that
 * snapshot construction always materializes it alongside `@codexo/exojs-tiled`,
 * even though this package's `TiledMap` source model does not yet convert
 * into the runtime `TileMap`.
 *
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-tiled/register'` for global auto-registration.
 */
export const tiledExtension: Extension = Object.freeze({
  id: '@codexo/exojs-tiled',
  dependencies: [tilemapExtension],
  assets: [tiledMapBinding],
});
