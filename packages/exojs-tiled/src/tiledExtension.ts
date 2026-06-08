import { Texture } from '@codexo/exojs';
import type { AssetBinding, AssetHandler, AssetLoadRequest, Extension } from '@codexo/exojs/extensions';
import type { AssetLoaderContext, Loader } from '@codexo/exojs';

import { TiledMap, type TiledMapData } from './TiledMap';

/**
 * Resolve a tileset image reference relative to the map's source path.
 * `new URL(ref, source)` only works when `source` is an absolute URL; the
 * loader is frequently called with relative paths, so fall back to a synthetic
 * base and strip it.
 */
function resolveRelative(ref: string, source: string): string {
  try {
    return new URL(ref, source).href;
  } catch {
    const base = 'https://exojs.invalid/';
    return new URL(ref, base + source.replace(/^\/+/, '')).href.slice(base.length);
  }
}

const tiledBinding: AssetBinding<TiledMap> = {
  type: TiledMap,
  typeNames: ['tiledMap'],
  extensions: ['tmj'],
  create(loader: Loader): AssetHandler<TiledMap> {
    return {
      async load({ source }: AssetLoadRequest, context: AssetLoaderContext): Promise<TiledMap> {
        const data = await context.fetchJson<TiledMapData>(source);

        if (!data || typeof data !== 'object' || !Array.isArray(data.tilesets)) {
          throw new Error(`TiledMap: invalid or unsupported map file at "${source}".`);
        }

        if (data.infinite === true) {
          throw new Error(`TiledMap: infinite maps are not supported (at "${source}").`);
        }

        if (data.orientation !== undefined && data.orientation !== 'orthogonal') {
          throw new Error(`TiledMap: only orthogonal orientation is supported (got "${data.orientation}" at "${source}").`);
        }

        // Load tileset textures. Sub-assets are owned by the Loader cache —
        // TiledMap must NOT destroy them.
        const tilesetTextures = (await Promise.all(
          data.tilesets
            .filter(ts => ts.image !== undefined)
            .map(ts => loader.load(Texture, resolveRelative(ts.image!, source))),
        )) as Texture[];

        return new TiledMap(data, tilesetTextures);
      },
      destroy() {
        // This handler holds no loader-local resources.
      },
    };
  },
};

/**
 * Default immutable Tiled extension descriptor.
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-tiled/register'` for global auto-registration.
 */
export const tiledExtension: Extension = Object.freeze({
  id: '@codexo/exojs-tiled',
  assets: [tiledBinding],
});
