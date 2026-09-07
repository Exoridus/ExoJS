import { Asset, Container } from '@codexo/exojs';
import { TileMapNode } from '@codexo/exojs-tiled';
import type { TileMap } from '@codexo/exojs-tilemap';

import { TopDownScene } from './TopDownScene';

/**
 * The same level, loaded from `public/assets/town-square.tmj` instead of built
 * in code.
 *
 * `Asset.type('tileMap', url)` is the common-case binding: it parses the Tiled
 * source and converts it to the runtime `TileMap` that `TileMapNode` renders.
 * The tileset image is resolved relative to the map file, so both live in
 * `public/assets/`.
 *
 * `tiledExtension` has to be registered on the Application for this asset type
 * to exist - see `main.ts`.
 */
export class TiledMapScene extends TopDownScene {
  private _map!: TileMap;

  protected override async loadMap(): Promise<void> {
    this._map = await this.loader.load(Asset.type('tileMap', 'town-square.tmj'));
  }

  protected override buildMap(): Container {
    const container = new Container();

    container.addChild(new TileMapNode(this._map));

    return container;
  }
}
