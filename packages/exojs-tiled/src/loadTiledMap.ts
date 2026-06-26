import { type AssetLoaderContext,Texture } from '@codexo/exojs';

import type { TiledTilesetData, TiledTilesetRefData } from './data';
import { decodeTiledLayerData } from './decodeLayerData';
import { TiledMap } from './TiledMap';
import { TiledTileset, type TiledTilesetResources } from './TiledTileset';
import { resolveTiledUrl } from './url';
import { validateTiledMapData, validateTiledTilesetFileData } from './validate';

/**
 * Resolves and loads the image(s) referenced by a tileset: the atlas
 * `image` (if present) and any collection-of-images per-tile `image`
 * entries, relative to `baseUrl` (the resolved location of the file the
 * tileset data came from — the `.tmj` for an embedded tileset, the `.tsj`
 * for an external one).
 *
 * Textures are loaded via `context.loader`, which deduplicates concurrent
 * and repeated loads of the same normalized URL.
 */
async function loadTiledTilesetResources(data: TiledTilesetData, baseUrl: string, context: AssetLoaderContext, source?: string): Promise<TiledTilesetResources> {
  let imageUrl: string | undefined;
  let texture: Texture | undefined;

  if (data.image !== undefined) {
    imageUrl = resolveTiledUrl(data.image, baseUrl);
    texture = await context.loader.load(Texture, imageUrl);
  }

  let tileTextures: Map<number, Texture> | undefined;

  if (data.tiles !== undefined) {
    for (const tile of data.tiles) {
      if (tile.image === undefined) {
        continue;
      }

      const tileImageUrl = resolveTiledUrl(tile.image, baseUrl);
      const tileTexture: Texture = await context.loader.load(Texture, tileImageUrl);

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
async function loadTiledTileset(ref: TiledTilesetRefData, mapSource: string, context: AssetLoaderContext): Promise<TiledTileset> {
  if ('source' in ref) {
    const tsjUrl = resolveTiledUrl(ref.source, mapSource);
    const raw = await context.fetchJson(tsjUrl);
    const data = validateTiledTilesetFileData(raw, tsjUrl);
    const resources = await loadTiledTilesetResources(data, tsjUrl, context, tsjUrl);

    return new TiledTileset(data, ref.firstgid, resources);
  }

  const resources = await loadTiledTilesetResources(ref, mapSource, context);

  return new TiledTileset(ref, ref.firstgid, resources);
}

/**
 * Loads and resolves a Tiled map: fetches and validates the `.tmj`, resolves
 * each tileset (external `.tsj` or embedded) and its image(s), and returns
 * the assembled, GID-validated {@link TiledMap}.
 * @internal
 */
export async function loadTiledMap(source: string, context: AssetLoaderContext): Promise<TiledMap> {
  const raw = await context.fetchJson(source);
  // Decode any base64/gzip/zlib tile-layer data into plain GID arrays before
  // validation, so the rest of the pipeline stays CSV-shaped and synchronous.
  await decodeTiledLayerData(raw, source);
  const data = validateTiledMapData(raw, source);
  const tilesets = await Promise.all(data.tilesets.map(ref => loadTiledTileset(ref, source, context)));

  return new TiledMap(source, data, tilesets);
}
