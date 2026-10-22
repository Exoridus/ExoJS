import { Asset } from '@codexo/exojs';
import type { TileMap } from '@codexo/exojs/tilemap';

import { TopDownScene } from './TopDownScene';

/**
 * The level loaded from `public/assets/town-square.tmj`, edited in Tiled.
 *
 * `Asset.type('tileMap', url)` parses the Tiled source and converts it to the
 * runtime `TileMap`, tileset collision shapes and tile properties included.
 * The tileset image is resolved relative to the map file, so both live in
 * `public/assets/`. The map belongs to this scene's loader and is released
 * with the scene.
 *
 * `tiledExtension` has to be registered on the Application for this asset type
 * to exist - see `main.ts`.
 */
export class TiledMapScene extends TopDownScene {
  protected override async loadMap(): Promise<TileMap> {
    return await this.loader.load(Asset.type('tileMap', 'town-square.tmj'));
  }
}
