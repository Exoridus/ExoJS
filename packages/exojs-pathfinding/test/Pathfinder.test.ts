import { describe, expect, it } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { GridSpace } from '../src/spaces/GridSpace';
import { createRandom, gridFrom, parseCosts, referenceCost, walkCost } from './helpers';

const MAZE = ['..........', '.####.###.', '.#....#...', '.#.####.##', '.#......#.', '.#####.##.', '.....#....', '####.#.###', '.....#....', '.#########'];

describe('Pathfinder.findPath', () => {
  it('returns a cost-optimal path, checked against an independent Dijkstra', () => {
    const rows = MAZE;
    const grid = gridFrom(rows);
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(9, 8), { pruning: false });

    expect(result.status).toBe('found');
    expect(result.cost).toBeCloseTo(referenceCost(parseCosts(rows), 0, 0, 9, 8, 'no-corner-cutting'), 9);
    expect(walkCost(grid, result.nodes)).toBeCloseTo(result.cost, 9);
    expect(result.nodes[0]).toBe(grid.nodeAt(0, 0));
    expect(result.nodes.at(-1)).toBe(grid.nodeAt(9, 8));
  });

  it('stays optimal on randomized weighted grids', () => {
    const random = createRandom(0x5eed);
    const pathfinder = new Pathfinder();

    for (let trial = 0; trial < 40; trial++) {
      const size = 16;
      const costs: number[][] = [];

      for (let y = 0; y < size; y++) {
        const row: number[] = [];

        for (let x = 0; x < size; x++) {
          const roll = random();

          row.push(roll < 0.22 ? 0 : 1 + Math.floor(roll * 6));
        }

        costs.push(row);
      }

      costs[0]![0] = 1;
      costs[size - 1]![size - 1] = 1;

      const grid = GridSpace.from(size, size, (x, y) => costs[y]![x]!);
      const result = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(size - 1, size - 1));
      const expected = referenceCost(costs, 0, 0, size - 1, size - 1, 'no-corner-cutting');

      if (expected === Infinity) {
        expect(result.status).toBe('unreachable');
        continue;
      }

      expect(result.status).toBe('found');
      expect(result.cost).toBeCloseTo(expected, 9);
      expect(walkCost(grid, result.nodes)).toBeCloseTo(expected, 9);
    }
  });

  it('reports an unreachable goal without a partial path', () => {
    const grid = gridFrom(['..#..', '..#..', '..#..']);
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(4, 2));

    expect(result.status).toBe('unreachable');
    expect(result.nodes).toEqual([]);
    expect(result.points).toEqual([]);
    expect(result.cost).toBe(0);
  });

  it('snaps to the reachable node closest to an unreachable goal', () => {
    const grid = gridFrom(['..#..', '..#..', '..#..']);
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(4, 1), { snapToNearest: true });

    expect(result.status).toBe('found');
    expect(grid.nodeX(result.nodes.at(-1)!)).toBe(1);
    expect(walkCost(grid, result.nodes)).toBeCloseTo(result.cost, 9);
  });

  it('returns a traversable prefix when the node budget runs out', () => {
    const grid = gridFrom(MAZE);
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(9, 8), { maxExpandedNodes: 5 });

    expect(result.status).toBe('budget-exceeded');
    expect(result.expandedNodes).toBe(5);
    expect(result.nodes[0]).toBe(grid.nodeAt(0, 0));
    expect(walkCost(grid, result.nodes)).toBeCloseTo(result.cost, 9);
  });

  it('is deterministic across repeated and equal-cost queries', () => {
    // A fully open grid has a large set of equally optimal diagonal-first and
    // straight-first routes; only the pinned tie-break makes one of them the
    // answer every time.
    const grid = new GridSpace(9, 9);
    const pathfinder = new Pathfinder();
    const first = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(8, 8));
    const second = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(8, 8));
    const third = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(8, 8));

    expect(second.nodes).toEqual(first.nodes);
    expect(third.nodes).toEqual(first.nodes);
    expect(first.cost).toBeCloseTo(8 * Math.SQRT2, 9);
  });

  it('keeps interleaved queries over different spaces independent', () => {
    const small = gridFrom(['...', '.#.', '...']);
    const large = gridFrom(MAZE);
    const pathfinder = new Pathfinder();

    const smallAlone = pathfinder.findPath(small, small.nodeAt(0, 0), small.nodeAt(2, 2));
    const largeAlone = pathfinder.findPath(large, large.nodeAt(0, 0), large.nodeAt(9, 8));

    // Round trip through the larger space and back: the reused buffers keep the
    // previous space's g-scores and parents until a generation stamp retires
    // them, so a leak between spaces shows up here or nowhere.
    const smallAgain = pathfinder.findPath(small, small.nodeAt(0, 0), small.nodeAt(2, 2));
    const largeAgain = pathfinder.findPath(large, large.nodeAt(0, 0), large.nodeAt(9, 8));

    expect(smallAgain.nodes).toEqual(smallAlone.nodes);
    expect(smallAgain.cost).toBeCloseTo(smallAlone.cost, 9);
    expect(largeAgain.nodes).toEqual(largeAlone.nodes);
    expect(largeAgain.cost).toBeCloseTo(largeAlone.cost, 9);
  });

  it('carries the space revision so a caller can spot a stale path', () => {
    const grid = gridFrom(['...', '...', '...']);
    const pathfinder = new Pathfinder();
    const result = pathfinder.findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(2, 2));

    expect(result.revision).toBe(grid.revision);

    grid.setCost(1, 1, 0);

    expect(grid.revision).not.toBe(result.revision);
  });

  it('routes around expensive terrain rather than through it', () => {
    const grid = gridFrom(['.9.', '.9.', '...'], 'never');
    const result = new Pathfinder().findPath(grid, grid.nodeAt(0, 0), grid.nodeAt(2, 0));

    expect(result.nodes.map(node => [grid.nodeX(node), grid.nodeY(node)])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
    ]);
  });
});

describe('Pathfinder.findPathBetween', () => {
  it('maps world coordinates through the cell size and window origin', () => {
    const grid = new GridSpace(4, 4, { originX: 10, originY: 20, cellSize: 32 });
    const result = new Pathfinder().findPathBetween(grid, 10 * 32 + 5, 20 * 32 + 5, 12 * 32 + 5, 20 * 32 + 5);

    expect(result.status).toBe('found');
    expect(result.points[0]!.x).toBeCloseTo(10 * 32 + 16, 9);
    expect(result.points.at(-1)!.x).toBeCloseTo(12 * 32 + 16, 9);
  });

  it('reports unreachable for a point outside the window unless it may snap', () => {
    const grid = new GridSpace(4, 4, { cellSize: 32 });
    const pathfinder = new Pathfinder();

    expect(pathfinder.findPathBetween(grid, 16, 16, 1000, 1000).status).toBe('unreachable');
    expect(pathfinder.findPathBetween(grid, 16, 16, 1000, 1000, { snapToNearest: true }).status).toBe('found');
  });
});

describe('Pathfinder.floodFrom', () => {
  it('settles every node within the cost budget, cheapest first', () => {
    const grid = gridFrom(['...', '.#.', '...'], 'never');
    const region = new Pathfinder().floodFrom(grid, grid.nodeAt(0, 0), { maxCost: 2 });

    expect(region.nodes).toHaveLength(5);
    expect(region.costs).toEqual([...region.costs].sort((a, b) => a - b));
    expect(region.nodes).not.toContain(grid.nodeAt(1, 1));
    expect(region.nodes).not.toContain(grid.nodeAt(2, 2));
  });

  it('prices terrain the same way a path query does', () => {
    const grid = gridFrom(['.5.'], 'never');
    const region = new Pathfinder().floodFrom(grid, grid.nodeAt(0, 0));

    expect(region.costs).toEqual([0, 5, 6]);
  });
});
