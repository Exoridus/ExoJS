import type { AssetFactoryContext, Texture } from '@codexo/exojs';
import { Asset } from '@codexo/exojs';

import type { TiledLayerData, TiledMapData, TiledTilesetData, TiledTilesetRefData } from './data';
import { resolveTiledTemplates } from './templates';
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
const loadTiledTilesetResources = async (
  data: TiledTilesetData,
  baseUrl: string,
  context: TiledContext,
  source?: string,
): Promise<TiledTilesetResources> => {
  let imageUrl: string | undefined;
  let texturePending: Promise<Texture> | undefined;

  if (data.image !== undefined) {
    imageUrl = resolveTiledUrl(data.image, baseUrl);
    texturePending = context.dependencies.load(Asset.type('texture', imageUrl));
  }

  // Every image is requested before any is awaited, so a tileset of per-tile
  // images costs one round of latency rather than one per tile.
  const tileEntries: Array<[number, Promise<Texture>]> = [];

  for (const tile of data.tiles ?? []) {
    if (tile.image !== undefined) {
      tileEntries.push([tile.id, context.dependencies.load(Asset.type('texture', resolveTiledUrl(tile.image, baseUrl)))]);
    }
  }

  const texture = await texturePending;
  const loaded = await Promise.all(tileEntries.map(async ([id, pending]) => [id, await pending] as const));
  const tileTextures = loaded.length > 0 ? new Map<number, Texture>(loaded) : undefined;

  return { source, imageUrl, texture, tileTextures };
};

/**
 * Resolves one `tilesets[]` entry of a `.tmj` file to a {@link TiledTileset}:
 * fetches and validates the external `.tsj` if `ref.source` is set, or uses
 * the embedded tileset data directly, then resolves and loads its image(s).
 */
const loadTiledTileset = async (ref: TiledTilesetRefData, mapSource: string, context: TiledContext): Promise<TiledTileset> => {
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
};

/**
 * Recursively walks the layer tree and loads the image for every
 * `imagelayer` encountered. Returns a `Map` keyed by layer `id` so that
 * {@link TiledMap.toTileMap} can attach the pre-loaded {@link Texture} to each
 * runtime image layer without performing additional I/O.
 */
const loadImageLayerTextures = async (
  layers: readonly TiledLayerData[],
  mapSource: string,
  context: TiledContext,
): Promise<Map<number, Texture>> => {
  const pending: Array<Promise<Map<number, Texture>>> = [];

  for (const layer of layers) {
    if (layer.type === 'imagelayer' && layer.image) {
      const imageUrl = resolveTiledUrl(layer.image, mapSource);

      pending.push(context.dependencies.load(Asset.type('texture', imageUrl)).then(texture => new Map([[layer.id, texture as Texture]])));
    } else if (layer.type === 'group') {
      pending.push(loadImageLayerTextures(layer.layers, mapSource, context));
    }
  }

  const result = new Map<number, Texture>();

  for (const part of await Promise.all(pending)) {
    for (const [id, texture] of part) {
      result.set(id, texture);
    }
  }

  return result;
};

/**
 * Assembles a validated Tiled document into a {@link TiledMap}: merges every
 * object template in, resolves every tileset (external `.tsj` or embedded)
 * and its images, loads every image
 * layer's texture, and validates the GIDs against the assembled tilesets.
 * @internal
 */
export const loadTiledMap = async (authored: TiledMapData, context: TiledContext): Promise<TiledMap> => {
  const source = context.source;
  const data = await resolveTiledTemplates(authored, source, context);
  const [tilesets, imageTextures] = await Promise.all([
    Promise.all(data.tilesets.map(ref => loadTiledTileset(ref, source, context))),
    loadImageLayerTextures(data.layers, source, context),
  ]);

  return new TiledMap(source, data, tilesets, imageTextures);
};
