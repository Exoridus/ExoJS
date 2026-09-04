import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';

declare const unit: { tileX: number; tileY: number; movement: number };
declare const highlight: (x: number, y: number, cost: number) => void;

const grid = new GridSpace(64, 40, { cellSize: 32 });
const pathfinder = new Pathfinder();

// #region guide:flood
const region = pathfinder.floodFrom(grid, grid.nodeAt(unit.tileX, unit.tileY), {
  maxCost: unit.movement,
});

for (let index = 0; index < region.nodes.length; index++) {
  const node = region.nodes[index]!;

  highlight(grid.nodeX(node), grid.nodeY(node), region.costs[index]!);
}
// #endregion guide:flood
