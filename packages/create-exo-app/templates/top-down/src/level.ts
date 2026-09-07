/**
 * The level both scenes use, one character per tile: `#` is a wall, `S` is the
 * spawn, everything else is walkable floor.
 *
 * Keeping it here rather than in a scene is what lets the procedural scene and
 * the Tiled scene claim to show the same level. `town-square.tmj` was generated
 * from these rows, so a change here means regenerating that file - see the
 * README.
 */
export const LEVEL = [
  '####################',
  '#        #         #',
  '#  S     #    ###  #',
  '#        #    #    #',
  '#  ####  #    #    #',
  '#     #  #    #### #',
  '#     #       #    #',
  '#     ######  #    #',
  '#             #    #',
  '#  #########  #    #',
  '#  #             # #',
  '#  #  #########  # #',
  '#     #       #    #',
  '#     #       #    #',
  '####################',
] as const;

/** Edge length of one tile, in pixels, matching `town-square.tmj`. */
export const TILE = 64;

export const COLUMNS = LEVEL[0].length;
export const ROWS = LEVEL.length;

export const isWall = (column: number, row: number): boolean => LEVEL[row]?.[column] === '#';

/**
 * Traversal cost of one cell for the pathfinder: `0` means impassable, and any
 * positive number is a relative cost.
 */
export const cellCost = (column: number, row: number): number => (isWall(column, row) ? 0 : 1);

/** World-space centre of a tile. */
export const tileCenter = (column: number, row: number): { x: number; y: number } => ({
  x: (column + 0.5) * TILE,
  y: (row + 0.5) * TILE,
});

/** Tile coordinates of the first occurrence of `marker`. */
export const findMarker = (marker: string): { column: number; row: number } => {
  for (const [row, line] of LEVEL.entries()) {
    const column = line.indexOf(marker);

    if (column !== -1) {
      return { column, row };
    }
  }

  throw new Error(`LEVEL has no ${marker} marker.`);
};
