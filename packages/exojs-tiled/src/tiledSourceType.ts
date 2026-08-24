import type { AssetFactory, AssetSourceCodec } from '@codexo/exojs';
import { type AssetRequest, AssetType, jsonSourceCodec } from '@codexo/exojs';

import type { TiledMapData } from './data';
import { decodeTiledLayerData } from './decodeLayerData';
import { loadTiledMap } from './loadTiledMap';
import { TiledMap } from './TiledMap';
import { resolveTiledOptions, type TiledLoadOptions } from './tiledOptions';
import { validateTiledMapData } from './validate';

/** The JSON codec, narrowed to the two acquisition halves this type reuses verbatim. */
const jsonStringCodec = jsonSourceCodec as Required<AssetSourceCodec<unknown, string>>;

/**
 * The raw parsed Tiled source model, for diagnostics and for tools that need
 * the `.tmj` as authored.
 *
 * It claims no file suffixes: `.tmj` belongs to the runtime `tileMap` type,
 * which is what a bare Tiled path should resolve to. The name is `tiledSource`
 * rather than `tiledMap` because the runtime type next to it is `tileMap`, and
 * two ids one letter apart resolve to the wrong type instead of failing.
 */
export class TiledSourceAssetType extends AssetType<TiledMapData, TiledMap, TiledLoadOptions, string> {
  public readonly id = 'tiledSource';
  public override readonly _token = TiledMap;
  // Stored as the text that arrived; decoding is where the compressed layer
  // payloads are expanded and the document is validated, so a cache hit is
  // re-read exactly like a fresh download.
  public override readonly codec: AssetSourceCodec<TiledMapData, string> = {
    fromResponse: (response, context) => jsonStringCodec.fromResponse(response, context),
    fromBytes: (bytes, context) => jsonStringCodec.fromBytes(bytes, context),
    async decode(stored, context) {
      const raw: unknown = JSON.parse(stored);

      // Expand any base64/gzip/zlib tile-layer payload before validation, so the
      // rest of the pipeline stays CSV-shaped and synchronous.
      await decodeTiledLayerData(raw, context.locator);

      return validateTiledMapData(raw, context.locator);
    },
  };

  public override resourceIdentity({ options }: AssetRequest<TiledLoadOptions>): string {
    return resolveTiledOptions(options).format;
  }

  public createFactory(): AssetFactory<TiledMapData, TiledMap, TiledLoadOptions> {
    return { create: (source, context) => loadTiledMap(source, context) };
  }
}

/** The Tiled source-model asset type. Install it through `tiledExtension`. */
export const tiledSourceType = new TiledSourceAssetType();
