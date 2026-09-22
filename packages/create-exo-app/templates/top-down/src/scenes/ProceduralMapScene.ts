import { Asset, Container, TextureRegion } from '@codexo/exojs';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileSet } from '@codexo/exojs-tilemap';

import { COLUMNS, isWall, ROWS, TILE } from '../level';
import { TopDownScene } from './TopDownScene';

/** Local tile ids in `map-pack.png`. `town-square.tmj` uses the same two. */
const FLOOR_TILE = 0;
const WALL_TILE = 5;

/**
 * The level built in code: a `TileSet` over the atlas, one `TileLayer` filled
 * from `level.ts`, and a `TileMap` around it. No map file is involved.
 *
 * This is the right shape when the level is generated - procedural dungeons,
 * puzzle boards, anything whose layout is decided at runtime. When a designer
 * edits the level instead, see `TiledMapScene`.
 */
export class ProceduralMapScene extends TopDownScene {
  protected override async loadMap(): Promise<void> {
    // Awaited rather than handed over as a `loader.get()` handle: `TileSet`
    // needs a region with real dimensions, which an unhydrated handle has not
    // got yet.
    await this.loader.load(Asset.type('texture', 'map-pack.png'));
  }

  protected override buildMap(): Container {
    const texture = this.loader.get('map-pack.png');
    const tileset = new TileSet({
      name: 'map-pack',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });

    const ground = new TileLayer({
      id: 1,
      name: 'ground',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
    });

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        ground.setTileAt(column, row, {
          tileset,
          localTileId: isWall(column, row) ? WALL_TILE : FLOOR_TILE,
          transform: TILE_TRANSFORM_IDENTITY,
        });
      }
    }

    const map = new TileMap({
      name: 'town-square',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
      layers: [ground],
    });

    const container = new Container();

    container.addChild(map.createView({ bands: { ground: ['ground'] } }).band('ground'));

    return container;
  }
}
