import { Vector } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { GridSpace } from '../src/spaces/GridSpace';
import { gridFrom } from './helpers';

const neighborsOf = (grid: GridSpace, x: number, y: number, agentSize = 1): [number, number][] => {
  const nodes = new Int32Array(8);
  const costs = new Float64Array(8);
  const count = grid.neighbors(grid.nodeAt(x, y), agentSize, nodes, costs);
  const out: [number, number][] = [];

  for (let index = 0; index < count; index++) {
    out.push([grid.nodeX(nodes[index]!), grid.nodeY(nodes[index]!)]);
  }

  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

describe('GridSpace', () => {
  it('treats everything outside the window as blocked', () => {
    const grid = new GridSpace(3, 3, { originX: 100, originY: 200 });

    expect(grid.nodeAt(99, 200)).toBe(-1);
    expect(grid.isWalkable(99, 200)).toBe(false);
    expect(grid.costAt(1000, 1000)).toBe(0);
    expect(neighborsOf(grid, 100, 200)).toEqual([
      [100, 201],
      [101, 200],
      [101, 201],
    ]);
  });

  it('passes absolute cell coordinates to the cost callback', () => {
    const seen: [number, number][] = [];

    GridSpace.from(
      2,
      1,
      (x, y) => {
        seen.push([x, y]);

        return 1;
      },
      { originX: 7, originY: 9 },
    );

    expect(seen).toEqual([
      [7, 9],
      [8, 9],
    ]);
  });

  it('blocks cells whose cost is not finite and positive', () => {
    const grid = GridSpace.from(3, 1, x => [1, Number.NaN, -4][x]!);

    expect(grid.isWalkable(0, 0)).toBe(true);
    expect(grid.isWalkable(1, 0)).toBe(false);
    expect(grid.isWalkable(2, 0)).toBe(false);
  });

  it('forbids a diagonal past a blocked orthogonal neighbour by default', () => {
    const grid = gridFrom(['.#', '#.']);

    expect(neighborsOf(grid, 0, 0)).toEqual([]);
    expect(gridFrom(['.#', '#.'], 'always').neighbors(0, 1, new Int32Array(8), new Float64Array(8))).toBe(1);
  });

  it('prices a diagonal step by its length', () => {
    const grid = gridFrom(['..', '.4']);
    const nodes = new Int32Array(8);
    const costs = new Float64Array(8);
    const count = grid.neighbors(grid.nodeAt(0, 0), 1, nodes, costs);
    const diagonal = costs[[...nodes.slice(0, count)].indexOf(grid.nodeAt(1, 1))]!;

    expect(diagonal).toBeCloseTo(4 * Math.SQRT2, 9);
  });

  it('drops diagonals entirely under the four-connected policy', () => {
    expect(neighborsOf(new GridSpace(3, 3, { diagonals: 'never' }), 1, 1)).toEqual([
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
    ]);
  });

  it('bumps the revision only when a cost actually changes', () => {
    const grid = new GridSpace(4, 4);
    const before = grid.revision;

    grid.setCost(1, 1, 1);

    expect(grid.revision).toBe(before);

    grid.setCost(1, 1, 0);

    expect(grid.revision).toBe(before + 1);
  });

  it('measures clearance as the walkable block anchored at a cell', () => {
    const grid = gridFrom(['....', '....', '..#.', '....']);

    expect(grid.clearanceAt(0, 0)).toBe(2);
    expect(grid.clearanceAt(2, 2)).toBe(0);
    expect(grid.clearanceAt(3, 3)).toBe(1);
    expect(grid.clearanceAt(0, 2)).toBe(2);
  });

  it('recomputes clearance after an edit', () => {
    const grid = new GridSpace(4, 4);

    expect(grid.clearanceAt(0, 0)).toBe(4);

    grid.setCost(2, 2, 0);

    expect(grid.clearanceAt(0, 0)).toBe(2);
  });

  it('keeps an agent wider than one cell out of a gap it does not fit through', () => {
    const grid = gridFrom(['....', '....', '.##.', '....']);

    expect(neighborsOf(grid, 0, 0, 2)).toEqual([[1, 0]]);
    expect(neighborsOf(grid, 0, 0, 1)).toContainEqual([1, 1]);
  });

  it('maps nodes to cell centres in world space', () => {
    const grid = new GridSpace(4, 4, { originX: 2, originY: 3, cellSize: 16, cellOriginX: 100, cellOriginY: 50 });
    const point = new Vector();

    grid.nodeToPoint(grid.nodeAt(2, 3), point);

    expect(point.x).toBeCloseTo(2 * 16 + 8 + 100, 9);
    expect(point.y).toBeCloseTo(3 * 16 + 8 + 50, 9);
    expect(grid.pointToNode(point.x, point.y)).toBe(grid.nodeAt(2, 3));
  });

  it('clamps a point outside the window to the closest node', () => {
    const grid = new GridSpace(4, 4, { cellSize: 10 });

    expect(grid.nearestNode(-500, 500)).toBe(grid.nodeAt(0, 3));
  });

  it('keeps the heuristic admissible on a weighted grid', () => {
    const grid = GridSpace.from(8, 8, (x, y) => (x === 0 && y === 0 ? 0.25 : 4));

    // The estimate is scaled by the cheapest walkable cell, so it can never
    // exceed the true remaining cost of a route made of expensive cells.
    expect(grid.heuristic(grid.nodeAt(0, 7), grid.nodeAt(0, 0))).toBeCloseTo(7 * 0.25, 9);
  });
});
