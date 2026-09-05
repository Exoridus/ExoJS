import type { Vector } from '@codexo/exojs';
import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';

declare const hero: { x: number; y: number; follow: (points: readonly Vector[]) => void };
declare const target: { x: number; y: number };

const grid = new GridSpace(64, 40, { cellSize: 32 });

// #region guide:query
const pathfinder = new Pathfinder();

const result = pathfinder.findPathBetween(grid, hero.x, hero.y, target.x, target.y, {
  smooth: true,
  agentSize: 2,
  maxExpandedNodes: 4000,
});

switch (result.status) {
  case 'found':
    hero.follow(result.points);
    break;
  case 'budget-exceeded':
    // A real, traversable prefix. Walk it and ask again next frame.
    hero.follow(result.points);
    break;
  case 'unreachable':
    break;
}
// #endregion guide:query

// #region guide:staleness
const plannedAt = result.revision;

const isStale = (): boolean => plannedAt !== grid.revision;
// #endregion guide:staleness

void isStale;
