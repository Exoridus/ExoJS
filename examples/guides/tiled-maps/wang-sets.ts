import { Asset, Scene } from '@codexo/exojs';
import { tiledWangSetToWangSet } from '@codexo/exojs-tiled';
import { autoTile, refreshCell } from '@codexo/exojs-tilemap';

class WangSetScene extends Scene {
  public override async load(): Promise<void> {
    const map = await this.loader.load(Asset.type('tiledSource', 'levels/forest.tmj'));
    const tx = 0;
    const ty = 0;

    // #region guide:wang-sets
    const tileMap = map.toTileMap();
    const [ground] = tileMap.layers;

    // wangSets live on the parsed TiledTileset, keyed by the runtime tileset's
    // index within `layer.tilesets` (0 here - the layer's only tileset).
    const [wangSetData] = map.tilesets[0].wangSets;
    const wangSet = tiledWangSetToWangSet(wangSetData, 0);

    // A 'mixed' wangset has no single-mask equivalent and converts to null.
    if (wangSet) {
      // Re-derive every autotiled variant across the whole layer, e.g. after
      // generating terrain procedurally:
      autoTile(ground, wangSet);

      // Or, after painting a single cell, refresh just that cell and its eight
      // neighbours instead of re-running autoTile over the whole layer:
      refreshCell(ground, tx, ty, wangSet);
    }
    // #endregion guide:wang-sets
  }
}

export { WangSetScene };
