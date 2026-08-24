import type { AssetFactoryContext, Texture } from '@codexo/exojs';
import { Asset } from '@codexo/exojs';

import type { TiledLayerData, TiledMapData, TiledTilesetData, TiledTilesetRefData } from './data';
import { TiledMap } from './TiledMap';
import type { TiledLoadOptions } from './tiledOptions';
import { TiledTileset, type TiledTilesetResources } from './TiledTileset';
import { resolveTiledUrl } from './url';
import { validateTiledTilesetFileData } from './validate';

/** What every step below needs from the load it belongs to. */
type TiledContext = AssetFactoryContext<TiledLoadOptions>;

/**
 * Resolves and loads the image(s) referenced by a tileset: the atlas
 * `image` (if present) and any collection-of-images per-tile `image`
 * entries, relative to `baseUrl` (the resolved location of the file the
 * tileset data came from - the `.tmj` for an embedded tileset, the `.tsj`
 * for an external one).
 *
 * Textures are claimed by this map's own dependency scope, which deduplicates
 * concurrent and repeated loads of the same normalized URL and releases them
 * with the map.
 */
async function loadTiledTilesetResources(data: TiledTilesetData, baseUrl: string, context: TiledContext, source?: string): Promise<TiledTilesetResources> {
  let imageUrl: string | undefined;
  let texture: Texture | undefined;

  if (data.image !== undefined) {
    imageUrl = resolveTiledUrl(data.image, baseUrl);
    texture = await context.dependencies.load(Asset.type('texture', imageUrl));
  }

  let tileTextures: Map<number, Texture> | undefined;

  if (data.tiles !== undefined) {
    for (const tile of data.tiles) {
      if (tile.image === undefined) {
        continue;
      }

      const tileImageUrl = resolveTiledUrl(tile.image, baseUrl);
      const tileTexture: Texture = await context.dependencies.load(Asset.type('texture', tileImageUrl));

      tileTextures ??= new Map();
      tileTextures.set(tile.id, tileTexture);
    }
  }

  return { source, imageUrl, texture, tileTextures };
}

/**
 * Resolves one `tilesets[]` entry of a `.tmj` file to a {@link TiledTileset}:
 * fetches and validates the external `.tsj` if `ref.source` is set, or uses
 * the embedded tileset data directly, then resolves and loads its image(s).
 */
async function loadTiledTileset(ref: TiledTilesetRefData, mapSource: string, context: TiledContext): Promise<TiledTileset> {
  if ('source' in ref) {
    const tsjUrl = resolveTiledUrl(ref.source, mapSource);
    // An external tileset is an ordinary JSON asset: acquiring it through the
    // dependency scope gives it its own identity and cache record, and shares
    // one download between every map that references it.
    const raw = await context.dependencies.load(Asset.type('json', tsjUrl));
    const data = validateTiledTilesetFileData(raw, tsjUrl);
    const resources = await loadTiledTilesetResources(data, tsjUrl, context, tsjUrl);

    return new TiledTileset(data, ref.firstgid, resources);
  }

  const resources = await loadTiledTilesetResources(ref, mapSource, context);

  return new TiledTileset(ref, ref.firstgid, resources);
}

/**
 * Recursively walks the layer tree and loads the image for every
 * `imagelayer` encountered. Returns a `Map` keyed by layer `id` so that
 * {@link TiledMap.toTileMap} can attach the pre-loaded {@link Texture} to each
 * runtime image layer without performing additional I/O.
 */
async function loadImageLayerTextures(
  layers: readonly TiledLayerData[],
  mapSource: string,
  context: TiledContext,
): Promise<Map<number, Texture>> {
  const result = new Map<number, Texture>();

  for (const layer of layers) {
    if (layer.type === 'imagelayer' && layer.image) {
      const imageUrl = resolveTiledUrl(layer.image, mapSource);
      const texture: Texture = await context.dependencies.load(Asset.type('texture', imageUrl));
      result.set(layer.id, texture);
    } else if (layer.type === 'group') {
      const nested = await loadImageLayerTextures(layer.layers, mapSource, context);
      for (const [id, tex] of nested) {
        result.set(id, tex);
      }
    }
  }

  return result;
}

/**
 * Assembles a validated Tiled document into a {@link TiledMap}: resolves every
 * tileset (external `.tsj` or embedded) and its images, loads every image
 * layer's texture, and validates the GIDs against the assembled tilesets.
 * @internal
 */
export async function loadTiledMap(data: TiledMapData, context: TiledContext): Promise<TiledMap> {
  const source = context.source;
  const [tilesets, imageTextures] = await Promise.all([
    Promise.all(data.tilesets.map(ref => loadTiledTileset(ref, source, context))),
    loadImageLayerTextures(data.layers, source, context),
  ]);

  return new TiledMap(source, data, tilesets, imageTextures);
}
