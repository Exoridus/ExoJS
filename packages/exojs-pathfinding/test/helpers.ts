import type { DiagonalPolicy } from '../src/spaces/GridSpace';
import { GridSpace } from '../src/spaces/GridSpace';

/** Deterministic PRNG, so a failing randomized case is reproducible from its seed. */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Cost grid from an ASCII map: `#` blocks, `.` costs 1, a digit costs its value.
 */
export const parseCosts = (rows: readonly string[]): number[][] =>
  rows.map(row =>
    [...row].map(cell => {
      if (cell === '#') return 0;
      if (cell === '.') return 1;

      return Number.parseInt(cell, 10);
    }),
  );

export const gridFrom = (rows: readonly string[], diagonals: DiagonalPolicy = 'no-corner-cutting'): GridSpace => {
  const costs = parseCosts(rows);

  return GridSpace.from(costs[0]!.length, costs.length, (x, y) => costs[y]![x]!, { diagonals });
};

const SQRT2 = Math.SQRT2;

/**
 * Plain Dijkstra over the same movement rules, written independently of the
 * package so that "A* is optimal" is checked against something other than A*.
 */
export const referenceCost = (costs: readonly number[][], startX: number, startY: number, goalX: number, goalY: number, diagonals: DiagonalPolicy): number => {
  const height = costs.length;
  const width = costs[0]!.length;
  const best = costs.map(row => row.map(() => Infinity));
  const settled = costs.map(row => row.map(() => false));

  best[startY]![startX] = 0;

  for (;;) {
    let bestX = -1;
    let bestY = -1;
    let bestCost = Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (settled[y]![x] === true || best[y]![x]! >= bestCost) continue;

        bestCost = best[y]![x]!;
        bestX = x;
        bestY = y;
      }
    }

    if (bestX < 0) break;

    settled[bestY]![bestX] = true;

    for (let stepY = -1; stepY <= 1; stepY++) {
      for (let stepX = -1; stepX <= 1; stepX++) {
        if (stepX === 0 && stepY === 0) continue;

        const diagonal = stepX !== 0 && stepY !== 0;

        if (diagonal && diagonals === 'never') continue;

        const x = bestX + stepX;
        const y = bestY + stepY;

        if (x < 0 || y < 0 || x >= width || y >= height) continue;

        const cellCost = costs[y]![x]!;

        if (cellCost <= 0) continue;

        if (diagonal && diagonals === 'no-corner-cutting') {
          if ((costs[bestY]![x] ?? 0) <= 0 || (costs[y]![bestX] ?? 0) <= 0) continue;
        }

        const candidate = bestCost + cellCost * (diagonal ? SQRT2 : 1);

        if (candidate < best[y]![x]!) best[y]![x] = candidate;
      }
    }
  }

  return best[goalY]![goalX]!;
};

/**
 * Recomputes a node path's cost while asserting it is a legal walk: contiguous
 * steps, walkable cells, and no diagonal that cuts a corner.
 */
export const walkCost = (grid: GridSpace, nodes: readonly number[], diagonals: DiagonalPolicy = 'no-corner-cutting'): number => {
  let total = 0;

  for (let index = 1; index < nodes.length; index++) {
    const fromX = grid.nodeX(nodes[index - 1]!);
    const fromY = grid.nodeY(nodes[index - 1]!);
    const toX = grid.nodeX(nodes[index]!);
    const toY = grid.nodeY(nodes[index]!);
    const stepX = toX - fromX;
    const stepY = toY - fromY;

    if (Math.abs(stepX) > 1 || Math.abs(stepY) > 1) throw new Error(`Non-contiguous step ${fromX},${fromY} -> ${toX},${toY}.`);
    if (!grid.isWalkable(toX, toY)) throw new Error(`Step into blocked cell ${toX},${toY}.`);

    const diagonal = stepX !== 0 && stepY !== 0;

    if (diagonal && diagonals === 'no-corner-cutting' && (!grid.isWalkable(toX, fromY) || !grid.isWalkable(fromX, toY))) {
      throw new Error(`Corner cut at ${fromX},${fromY} -> ${toX},${toY}.`);
    }

    total += grid.costAt(toX, toY) * (diagonal ? SQRT2 : 1);
  }

  return total;
};
