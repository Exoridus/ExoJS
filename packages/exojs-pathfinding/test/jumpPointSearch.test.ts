import { describe, expect, it } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { GridSpace } from '../src/spaces/GridSpace';
import { createRandom, walkCost } from './helpers';

const buildGrid = (size: number, blockedRatio: number, seed: number): GridSpace => {
  const random = createRandom(seed);
  const blocked: boolean[] = [];

  for (let index = 0; index < size * size; index++) {
    blocked.push(random() < blockedRatio);
  }

  blocked[0] = false;
  blocked[size * size - 1] = false;

  return GridSpace.from(size, size, (x, y) => (blocked[y * size + x] === true ? 0 : 1));
};

describe('jump-point search', () => {
  it('produces the same optimal cost as plain A* on randomized grids', () => {
    const pathfinder = new Pathfinder();

    for (let trial = 0; trial < 30; trial++) {
      const size = 24;
      const grid = buildGrid(size, 0.28, 0x1000 + trial);
      const start = grid.nodeAt(0, 0);
      const goal = grid.nodeAt(size - 1, size - 1);
      const jumped = pathfinder.findPath(grid, start, goal);
      const plain = pathfinder.findPath(grid, start, goal, { pruning: false });

      expect(jumped.status).toBe(plain.status);

      if (plain.status !== 'found') continue;

      expect(jumped.cost).toBeCloseTo(plain.cost, 9);
      // Both are contiguous cell paths, so the pruned one must be walkable step
      // by step - a jump run that skipped a wall would surface right here.
      expect(walkCost(grid, jumped.nodes)).toBeCloseTo(jumped.cost, 9);
      expect(jumped.nodes[0]).toBe(start);
      expect(jumped.nodes.at(-1)).toBe(goal);
      expect(jumped.nodes).toHaveLength(plain.nodes.length);
    }
  });

  it('agrees with A* on open grids, where the pruning is at its most aggressive', () => {
    const grid = new GridSpace(64, 64);
    const pathfinder = new Pathfinder();
    const jumped = pathfinder.findPath(grid, grid.nodeAt(2, 60), grid.nodeAt(60, 3));
    const plain = pathfinder.findPath(grid, grid.nodeAt(2, 60), grid.nodeAt(60, 3), { pruning: false });

    expect(jumped.cost).toBeCloseTo(plain.cost, 9);
    expect(jumped.expandedNodes).toBeLessThan(plain.expandedNodes);
  });

  it('never cuts the corner of a diagonal wall', () => {
    // Only the two diagonal cells are open; under 'no-corner-cutting' the two
    // halves of this grid are disconnected, and a textbook jump-point rule set
    // (which assumes corner cutting is legal) would happily walk through.
    const open = new Set(['0,0', '1,1', '2,2']);
    const grid = GridSpace.from(3, 3, (x, y) => (open.has(`${x},${y}`) ? 1 : 0));
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(2, 2));

    expect(result.status).toBe('unreachable');
  });

  it('refuses to prune where its assumptions do not hold', () => {
    const weighted = GridSpace.from(4, 4, (x, y) => (x === 1 && y === 1 ? 3 : 1));
    const cornerCutting = new GridSpace(4, 4, { diagonals: 'always' });
    const orthogonal = new GridSpace(4, 4, { diagonals: 'never' });
    const uniform = new GridSpace(4, 4);

    expect(weighted.pruning(1)).toBeNull();
    expect(cornerCutting.pruning(1)).toBeNull();
    expect(orthogonal.pruning(1)).toBeNull();
    expect(uniform.pruning(2)).toBeNull();
    expect(uniform.pruning(1)).not.toBeNull();
  });

  it('stops pruning as soon as a cost edit makes the grid non-uniform', () => {
    const grid = new GridSpace(8, 8);

    expect(grid.uniformCost).toBe(true);

    grid.setCost(3, 3, 4);

    expect(grid.uniformCost).toBe(false);
    expect(grid.pruning(1)).toBeNull();

    grid.setCost(3, 3, 1);

    expect(grid.uniformCost).toBe(true);
    expect(grid.pruning(1)).not.toBeNull();
  });

  it('finds the same path after the grid is edited under it', () => {
    const grid = new GridSpace(16, 16);
    const pathfinder = new Pathfinder();

    for (let y = 0; y < 15; y++) {
      grid.setCost(8, y, 0);
    }

    const jumped = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(15, 0));
    const plain = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(15, 0), { pruning: false });

    expect(jumped.cost).toBeCloseTo(plain.cost, 9);
    expect(walkCost(grid, jumped.nodes)).toBeCloseTo(jumped.cost, 9);
  });
});
