/**
 * The level `ProceduralMapScene` builds, one character per tile: `#` is a wall,
 * `D` a closed door, `S` the spawn, everything else is walkable floor.
 *
 * `town-square.tmj` holds the same layout for `TiledMapScene`, so a change here
 * means redrawing that file too - see the README. Neither scene reads this file
 * for collision or navigation: both derive those from their map's `Walls`
 * layer, so what the player sees is always what blocks them.
 *
 * The layout exercises what a top-down level needs: a one-tile gap only a
 * narrow actor fits through, a two-tile opening a wide one can use, a door that
 * opens and closes, and a sealed room nothing can reach.
 */
export const LEVEL = [
  '####################',
  '#       #    #     #',
  '#  S    #    #     #',
  '#            #     #',
  '#       #    #     #',
  '#       ######D#####',
  '#       #          #',
  '#       #          #',
  '#                  #',
  '#                  #',
  '######  #          #',
  '#  #    #          #',
  '#  #    #   ####   #',
  '####    #          #',
  '####################',
] as const;

/** Edge length of one tile, in pixels, matching `town-square.tmj`. */
export const TILE = 64;

export const COLUMNS = LEVEL[0].length;
export const ROWS = LEVEL.length;

/** Local tile ids in `map-pack.png`. `town-square.tmj` uses the same ones. */
export const FLOOR_TILE = 0;
export const WALL_TILE = 5;
export const DOOR_TILE = 127;

/** The level character at a tile, or `undefined` outside the level. */
export const cellAt = (column: number, row: number): string | undefined => LEVEL[row]?.[column];

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
