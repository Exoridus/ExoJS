import { GridSpace } from '@codexo/exojs-pathfinding';
import type { ResolvedTile, TileLayer } from '@codexo/exojs-tilemap';

declare const ground: TileLayer;
declare const loaded: { x: number; y: number; width: number; height: number };

// #region guide:tilemap-bridge
// The pathfinding package has no tilemap dependency. The bridge is this
// function, which lives in the game and answers out of whatever the map stores.
const walkCost = (tile: ResolvedTile | null): number => {
  if (tile === null) return 0;

  const definition = tile.tileset.getTileDefinition(tile.localTileId);

  // A tile with authored collision geometry is solid; everything else is
  // walkable, with the terrain's own cost if the map carries one.
  if (definition?.collision !== undefined) return 0;

  return typeof definition?.properties?.moveCost === 'number' ? definition.properties.moveCost : 1;
};

const navigation = GridSpace.from(loaded.width, loaded.height, (x, y) => walkCost(ground.getTileAt(x, y)), {
  originX: loaded.x,
  originY: loaded.y,
  cellSize: ground.tileWidth,
});
// #endregion guide:tilemap-bridge

// #region guide:tilemap-edit
const setTile = (x: number, y: number, tile: ResolvedTile): void => {
  ground.setTileAt(x, y, tile);
  navigation.setCost(x, y, walkCost(tile));
};
// #endregion guide:tilemap-edit

void setTile;
