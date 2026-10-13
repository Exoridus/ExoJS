import { Asset, TextureRegion } from '@codexo/exojs';
import { ObjectKind, ObjectLayer, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, type TileMapObject, TileSet } from '@codexo/exojs-tilemap';

import { cellAt, COLUMNS, DOOR_TILE, findMarker, FLOOR_TILE, ROWS, TILE, WALL_TILE } from '../level';
import { TopDownScene } from './TopDownScene';

/** A collision shape covering one whole tile, as Tiled stores a tile's collision. */
const wholeTile: TileMapObject = {
  id: 1,
  name: '',
  type: '',
  kind: ObjectKind.Rectangle,
  x: 0,
  y: 0,
  width: TILE,
  height: TILE,
  rotation: 0,
  visible: true,
  properties: {},
};

/**
 * The level built in code from `src/level.ts`: the same layers, tile
 * definitions and spawn object `town-square.tmj` carries, so the rest of the
 * scene cannot tell the two apart.
 *
 * This is the right shape when the level is generated - procedural dungeons,
 * puzzle boards, anything whose layout is decided at runtime. When a designer
 * edits the level instead, see `TiledMapScene`.
 */
export class ProceduralMapScene extends TopDownScene {
  protected override async loadMap(): Promise<TileMap> {
    // Awaited for the texture itself rather than a `loader.get()` handle:
    // `TileSet` needs a region with real dimensions.
    const texture = await this.loader.load(Asset.type('texture', 'map-pack.png'));
    const tileset = new TileSet({
      name: 'map-pack',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });

    tileset.setDefinitions([
      { localTileId: WALL_TILE, collision: [wholeTile] },
      { localTileId: DOOR_TILE, collision: [wholeTile], properties: { door: true } },
    ]);

    const layer = (id: number, name: string): TileLayer =>
      new TileLayer({ id, name, width: COLUMNS, height: ROWS, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset] });
    const ground = layer(1, 'Ground');
    const walls = layer(2, 'Walls');

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        ground.setTileAt(column, row, { tileset, localTileId: FLOOR_TILE, transform: TILE_TRANSFORM_IDENTITY });

        const cell = cellAt(column, row);

        if (cell === '#' || cell === 'D') {
          walls.setTileAt(column, row, { tileset, localTileId: cell === '#' ? WALL_TILE : DOOR_TILE, transform: TILE_TRANSFORM_IDENTITY });
        }
      }
    }

    const spawn = findMarker('S');

    // Built here rather than by the loader, so the scene owns it.
    return this.track(
      new TileMap({
        name: 'town-square',
        width: COLUMNS,
        height: ROWS,
        tileWidth: TILE,
        tileHeight: TILE,
        tilesets: [tileset],
        layers: [ground, walls],
        objectLayers: [
          new ObjectLayer({
            id: 3,
            name: 'Markers',
            objects: [
              {
                ...wholeTile,
                name: 'spawn',
                type: 'spawn',
                kind: ObjectKind.Point,
                x: (spawn.column + 0.5) * TILE,
                y: (spawn.row + 0.5) * TILE,
                width: 0,
                height: 0,
              },
            ],
          }),
        ],
      }),
    );
  }
}
