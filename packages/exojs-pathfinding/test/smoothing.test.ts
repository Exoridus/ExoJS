import { describe, expect, it } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { GridSpace } from '../src/spaces/GridSpace';
import { createRandom, gridFrom } from './helpers';

/**
 * Re-walks a smoothed path the way an agent would - straight from waypoint to
 * waypoint - and reports whether every cell it crosses is walkable.
 */
const segmentsAreClear = (grid: GridSpace, nodes: readonly number[]): boolean => {
  for (let index = 1; index < nodes.length; index++) {
    const fromX = grid.nodeX(nodes[index - 1]!) + 0.5;
    const fromY = grid.nodeY(nodes[index - 1]!) + 0.5;
    const toX = grid.nodeX(nodes[index]!) + 0.5;
    const toY = grid.nodeY(nodes[index]!) + 0.5;
    const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY) * 64);

    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = Math.floor(fromX + (toX - fromX) * t);
      const y = Math.floor(fromY + (toY - fromY) * t);

      if (!grid.isWalkable(x, y)) return false;
    }
  }

  return true;
};

describe('GridSpace.smoothPath', () => {
  it('removes the staircase from an open diagonal run', () => {
    const grid = new GridSpace(8, 8, { diagonals: 'never' });
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(7, 7), { smooth: true });

    expect(result.nodes).toEqual([grid.nodeAt(0, 0), grid.nodeAt(7, 7)]);
    expect(result.points).toHaveLength(2);
  });

  it('keeps the corners it has to keep', () => {
    const grid = gridFrom(['..........', '..........', '#####.####', '..........', '..........']);
    const pathfinder = new Pathfinder();
    const raw = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(0, 4));
    const smoothed = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(0, 4), { smooth: true });

    expect(smoothed.nodes.length).toBeLessThan(raw.nodes.length);
    expect(smoothed.nodes.length).toBeGreaterThan(2);
    expect(segmentsAreClear(grid, smoothed.nodes)).toBe(true);
  });

  it('leaves the reported cost as the cost of the walked path', () => {
    const grid = new GridSpace(8, 8, { diagonals: 'never' });
    const smoothed = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(7, 7), { smooth: true });

    expect(smoothed.cost).toBe(14);
  });

  it('never shortcuts across terrain more expensive than the section it replaces', () => {
    const grid = gridFrom(['....', '.99.', '....'], 'never');
    const pathfinder = new Pathfinder();
    const smoothed = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(3, 2), { smooth: true });

    for (const node of smoothed.nodes) {
      expect(grid.costAt(grid.nodeX(node), grid.nodeY(node))).toBe(1);
    }

    expect(segmentsAreClear(grid, smoothed.nodes)).toBe(true);
    // The straight line from the top-left to the bottom-right corner crosses the
    // expensive row, so smoothing must not collapse the detour into it.
    expect(smoothed.nodes.length).toBeGreaterThan(2);
  });

  it('keeps every smoothed segment walkable on randomized maps', () => {
    const random = createRandom(0xc0ffee);
    const pathfinder = new Pathfinder();

    for (let trial = 0; trial < 25; trial++) {
      const size = 20;
      const grid = GridSpace.from(size, size, (x, y) => {
        if ((x === 0 && y === 0) || (x === size - 1 && y === size - 1)) return 1;

        return random() < 0.2 ? 0 : 1;
      });
      const result = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(size - 1, size - 1), { smooth: true });

      if (result.status !== 'found') continue;

      expect(segmentsAreClear(grid, result.nodes)).toBe(true);
      expect(result.nodes[0]).toBe(grid.nodeAt(0, 0));
      expect(result.nodes.at(-1)).toBe(grid.nodeAt(size - 1, size - 1));
    }
  });

  it('respects clearance so a wide agent keeps its smoothed line', () => {
    const grid = gridFrom(['.......', '.......', '...#...', '.......', '.......']);
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(4, 3), { smooth: true, agentSize: 2 });

    expect(result.status).toBe('found');

    for (let index = 1; index < result.nodes.length; index++) {
      const node = result.nodes[index]!;

      expect(grid.clearanceAt(grid.nodeX(node), grid.nodeY(node))).toBeGreaterThanOrEqual(2);
    }
  });
});
