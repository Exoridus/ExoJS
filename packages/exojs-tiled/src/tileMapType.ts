import type { AssetFactory } from '@codexo/exojs';
import { type AssetRequest, AssetType } from '@codexo/exojs';
import { TileMap } from '@codexo/exojs-tilemap';

import { resolveTiledOptions, type TiledLoadOptions } from './tiledOptions';
import { tiledSourceType } from './tiledSourceType';

/**
 * The format-independent runtime {@link TileMap} produced from a `.tmj` file -
 * the common case.
 *
 * The `.tmj` itself is acquired once as a `tiledSource` dependency, so loading
 * both the runtime map and the source model for one URL shares a single
 * download and a single parsed document.
 */
export class TileMapAssetType extends AssetType<void, TileMap, TiledLoadOptions> {
  public readonly id = 'tileMap';
  public override readonly extensions = ['tmj'];
  public override readonly _token = TileMap;

  public override resourceIdentity({ options }: AssetRequest<TiledLoadOptions>): string {
    return resolveTiledOptions(options).format;
  }

  /**
   * The runtime map has no source data of its own: it is built from the
   * `tiledSource` asset its factory loads. Acquiring the document here as well
   * would download, parse and validate it a second time under a second
   * identity.
   */
  public override unacquiredSource(): { source: void } {
    return { source: undefined };
  }

  public createFactory(): AssetFactory<void, TileMap, TiledLoadOptions> {
    return {
      async create(_source, context) {
        const tiledMap = await context.dependencies.load(tiledSourceType.asset(context.source, context.options));

        return tiledMap.toTileMap();
      },
    };
  }
}

/** The runtime tilemap asset type for Tiled maps. Install it through `tiledExtension`. */
export const tileMapType = new TileMapAssetType();
