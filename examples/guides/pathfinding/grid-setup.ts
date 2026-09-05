import { GridSpace } from '@codexo/exojs-pathfinding';

declare const isWall: (x: number, y: number) => boolean;
declare const isMud: (x: number, y: number) => boolean;

// #region guide:grid-setup
const grid = GridSpace.from(
  64,
  40,
  (x, y) => {
    if (isWall(x, y)) return 0;

    return isMud(x, y) ? 4 : 1;
  },
  { cellSize: 32 },
);
// #endregion guide:grid-setup

// #region guide:grid-edit
grid.setCost(12, 7, 0); // a door slams shut
grid.setCost(12, 7, 1); // and opens again

const revision = grid.revision; // changed, so every path taken before is suspect
// #endregion guide:grid-edit

void revision;
