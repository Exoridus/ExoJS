import type { Vector } from '@codexo/exojs';

import type { NavigationSpace, PrunedExpansion } from '../types';
import { DIRECTION_X, DIRECTION_Y, SQRT2 } from './gridGeometry';
import { GridJumpExpansion } from './GridJumpExpansion';

/**
 * How diagonal steps are allowed on a {@link GridSpace}.
 *
 * - `never` - four-connected movement only.
 * - `no-corner-cutting` - a diagonal step needs both cells it passes between to
 *   be walkable, which is what stops an agent from clipping through the corner
 *   where two walls meet.
 * - `always` - eight-connected movement with no such restriction.
 */
export type DiagonalPolicy = 'never' | 'no-corner-cutting' | 'always';

/** Construction options for {@link GridSpace}. */
export interface GridSpaceOptions {
  /** Cell x of the window's left column. Defaults to `0`. */
  readonly originX?: number | undefined;
  /** Cell y of the window's top row. Defaults to `0`. */
  readonly originY?: number | undefined;
  /** Defaults to `'no-corner-cutting'`. */
  readonly diagonals?: DiagonalPolicy | undefined;
  /**
   * World size of one cell. The distance metric assumes square cells, so a
   * tilemap with non-square tiles has to pick one axis. Defaults to `1`.
   */
  readonly cellSize?: number | undefined;
  /** World x of cell `0`'s left edge, before the window origin. Defaults to `0`. */
  readonly cellOriginX?: number | undefined;
  /** World y of cell `0`'s top edge, before the window origin. Defaults to `0`. */
  readonly cellOriginY?: number | undefined;
}

/**
 * A rectangular window of weighted, optionally blocked cells.
 *
 * The window is finite by construction: everything outside it is blocked, so a
 * search always terminates and an infinite or streamed world is served by
 * sizing the window to the region the actors are in, then feeding chunk changes
 * back through {@link setCost}. Coordinates in the public API are absolute cell
 * coordinates - the same numbers a tilemap uses - not offsets into the window.
 *
 * Cost `0` blocks a cell, `1` is ordinary ground and larger values are terrain
 * an agent will route around when it is cheaper to do so. Diagonal steps cost
 * their length, so the metric stays consistent with the octile heuristic.
 *
 * The space carries no scene node and no rendering: it is data plus a neighbour
 * relation, and it is built and mutated entirely by the application.
 */
export class GridSpace implements NavigationSpace {
  public readonly width: number;
  public readonly height: number;
  public readonly originX: number;
  public readonly originY: number;
  public readonly cellSize: number;
  public readonly cellOriginX: number;
  public readonly cellOriginY: number;
  public readonly diagonals: DiagonalPolicy;
  public readonly maxDegree: number;

  private readonly costs: Float32Array;
  private clearance: Uint16Array | null = null;
  private jumpExpansion: GridJumpExpansion | null = null;
  private weightedCells = 0;
  private minCost = 1;
  private currentRevision = 0;

  public constructor(width: number, height: number, options: GridSpaceOptions = {}) {
    if (__DEV__ && (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)) {
      throw new RangeError(`GridSpace needs positive integer dimensions, received ${width}x${height}.`);
    }

    this.width = width;
    this.height = height;
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    this.cellSize = options.cellSize ?? 1;
    this.cellOriginX = options.cellOriginX ?? 0;
    this.cellOriginY = options.cellOriginY ?? 0;
    this.diagonals = options.diagonals ?? 'no-corner-cutting';
    this.maxDegree = this.diagonals === 'never' ? 4 : 8;
    this.costs = new Float32Array(width * height).fill(1);
  }

  /**
   * Builds a window and fills it from a cost callback, which receives absolute
   * cell coordinates. This is the tilemap bridge: return `0` for a solid tile
   * and the terrain's cost for a walkable one, and the grid never learns what a
   * tilemap is.
   *
   * Values that are not finite and positive are stored as blocked.
   */
  public static from(width: number, height: number, cost: (x: number, y: number) => number, options: GridSpaceOptions = {}): GridSpace {
    const grid = new GridSpace(width, height, options);
    const { costs, originX, originY } = grid;

    let minCost = Infinity;
    let weighted = 0;

    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const raw = cost(originX + column, originY + row);
        const value = Number.isFinite(raw) && raw > 0 ? raw : 0;

        costs[row * width + column] = value;

        if (value === 0) continue;
        if (value !== 1) weighted++;
        if (value < minCost) minCost = value;
      }
    }

    grid.weightedCells = weighted;
    grid.minCost = minCost === Infinity ? 1 : minCost;

    return grid;
  }

  public get nodeCapacity(): number {
    return this.costs.length;
  }

  public get revision(): number {
    return this.currentRevision;
  }

  /**
   * `true` while every walkable cell costs exactly `1`. Jump-point search is
   * only available on such a grid.
   */
  public get uniformCost(): boolean {
    return this.weightedCells === 0;
  }

  /** The node at absolute cell coordinates, or `-1` outside the window. */
  public nodeAt(x: number, y: number): number {
    const column = x - this.originX;
    const row = y - this.originY;

    if (column < 0 || row < 0 || column >= this.width || row >= this.height) return -1;

    return row * this.width + column;
  }

  /** Absolute cell x of a node. */
  public nodeX(node: number): number {
    return this.originX + (node % this.width);
  }

  /** Absolute cell y of a node. */
  public nodeY(node: number): number {
    return this.originY + Math.floor(node / this.width);
  }

  /** Traversal cost of a cell; `0` for blocked cells and everything outside the window. */
  public costAt(x: number, y: number): number {
    const node = this.nodeAt(x, y);

    return node < 0 ? 0 : this.costs[node]!;
  }

  public isWalkable(x: number, y: number): boolean {
    return this.costAt(x, y) > 0;
  }

  /**
   * Sets a cell's cost and bumps {@link revision}. Values that are not finite
   * and positive block the cell. Coordinates outside the window are ignored.
   */
  public setCost(x: number, y: number, cost: number): void {
    const node = this.nodeAt(x, y);

    if (node < 0) return;

    const value = Number.isFinite(cost) && cost > 0 ? cost : 0;
    const previous = this.costs[node]!;

    if (value === previous) return;

    if (previous > 0 && previous !== 1) this.weightedCells--;
    if (value > 0 && value !== 1) this.weightedCells++;
    // Only lowered costs tighten the bound. A raised cost leaves it looser than
    // it could be, which keeps the heuristic admissible - the direction that
    // matters - without rescanning the whole window on every edit.
    if (value > 0 && value < this.minCost) this.minCost = value;

    this.costs[node] = value;
    this.clearance = null;
    this.currentRevision++;
  }

  /**
   * Largest agent width that fits with its top-left corner on this cell, or `0`
   * for a blocked cell. Recomputed lazily after the first edit that follows a
   * query.
   */
  public clearanceAt(x: number, y: number): number {
    const node = this.nodeAt(x, y);

    if (node < 0) return 0;

    return this.ensureClearance()[node]!;
  }

  public neighbors(node: number, agentSize: number, outNodes: Int32Array, outCosts: Float64Array): number {
    const { width, height, costs, diagonals } = this;
    const column = node % width;
    const row = (node / width) | 0;
    const clearance = agentSize > 1 ? this.ensureClearance() : null;
    const directions = diagonals === 'never' ? 4 : 8;
    const guardCorners = diagonals === 'no-corner-cutting';

    let count = 0;

    for (let direction = 0; direction < directions; direction++) {
      const stepX = DIRECTION_X[direction]!;
      const stepY = DIRECTION_Y[direction]!;
      const nextColumn = column + stepX;
      const nextRow = row + stepY;

      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;

      const next = nextRow * width + nextColumn;
      const cost = costs[next]!;

      if (cost <= 0) continue;
      if (clearance !== null && clearance[next]! < agentSize) continue;

      if (direction < 4) {
        outCosts[count] = cost;
      } else {
        if (guardCorners && (!this.fits(column + stepX, row, agentSize, clearance) || !this.fits(column, row + stepY, agentSize, clearance))) continue;

        outCosts[count] = cost * SQRT2;
      }

      outNodes[count] = next;
      count++;
    }

    return count;
  }

  public heuristic(node: number, goal: number): number {
    const { width } = this;
    const deltaX = Math.abs((node % width) - (goal % width));
    const deltaY = Math.abs(((node / width) | 0) - ((goal / width) | 0));

    if (this.diagonals === 'never') return (deltaX + deltaY) * this.minCost;

    // Octile distance, scaled by the cheapest walkable cell so that a weighted
    // grid cannot make the estimate exceed the true remaining cost.
    return (deltaX + deltaY + (SQRT2 - 2) * Math.min(deltaX, deltaY)) * this.minCost;
  }

  public nodeToPoint(node: number, out: Vector): void {
    const { width, cellSize } = this;

    out.set((this.originX + (node % width) + 0.5) * cellSize + this.cellOriginX, (this.originY + ((node / width) | 0) + 0.5) * cellSize + this.cellOriginY);
  }

  public pointToNode(x: number, y: number): number {
    const { cellSize } = this;

    return this.nodeAt(Math.floor((x - this.cellOriginX) / cellSize), Math.floor((y - this.cellOriginY) / cellSize));
  }

  public nearestNode(x: number, y: number): number {
    const { width, height, cellSize } = this;
    const column = Math.floor((x - this.cellOriginX) / cellSize) - this.originX;
    const row = Math.floor((y - this.cellOriginY) / cellSize) - this.originY;

    return Math.min(Math.max(row, 0), height - 1) * width + Math.min(Math.max(column, 0), width - 1);
  }

  public pruning(agentSize: number): PrunedExpansion | null {
    // Jump-point search derives its pruning rules from a uniform-cost grid with
    // a single-cell agent: weights make the symmetric alternatives it discards
    // no longer equivalent, and clearance changes which of them are legal.
    if (this.weightedCells > 0 || agentSize > 1 || this.diagonals !== 'no-corner-cutting') return null;

    this.jumpExpansion ??= new GridJumpExpansion(this.costs, this.width, this.height);

    return this.jumpExpansion;
  }

  /**
   * String-pulls the path: keeps a node only when the straight line past it is
   * blocked, so the result is the same route with its staircase removed.
   *
   * The returned nodes are no longer adjacent - the guarantee is that the
   * straight segment between two consecutive ones stays inside walkable cells
   * an agent of `agentSize` fits through, and never crosses terrain more
   * expensive than the section it replaces.
   */
  public smoothPath(nodes: readonly number[], agentSize: number): number[] {
    const last = nodes.length - 1;

    if (last < 2) return [...nodes];

    const { costs } = this;
    const out: number[] = [nodes[0]!];

    let anchor = 0;

    while (anchor < last) {
      let best = anchor + 1;
      let budget = Math.max(costs[nodes[anchor]!]!, costs[nodes[best]!]!);

      for (let index = anchor + 2; index <= last; index++) {
        budget = Math.max(budget, costs[nodes[index]!]!);

        if (!this.lineOfSight(nodes[anchor]!, nodes[index]!, agentSize, budget)) break;

        best = index;
      }

      out.push(nodes[best]!);
      anchor = best;
    }

    return out;
  }

  private fits(column: number, row: number, agentSize: number, clearance: Uint16Array | null): boolean {
    const { width, height } = this;

    if (column < 0 || row < 0 || column >= width || row >= height) return false;

    const index = row * width + column;

    if (this.costs[index]! <= 0) return false;

    return clearance === null || clearance[index]! >= agentSize;
  }

  /**
   * Walks the cells a centre-to-centre segment passes through and reports
   * whether all of them are traversable within `budget`. A segment that leaves
   * a cell exactly through its corner counts as a diagonal step and is subject
   * to the same corner rule as movement.
   */
  private lineOfSight(from: number, to: number, agentSize: number, budget: number): boolean {
    const { width, costs, diagonals } = this;
    const clearance = agentSize > 1 ? this.ensureClearance() : null;
    const targetColumn = to % width;
    const targetRow = (to / width) | 0;

    let column = from % width;
    let row = (from / width) | 0;

    const spanX = Math.abs(targetColumn - column);
    const spanY = Math.abs(targetRow - row);
    const stepX = Math.sign(targetColumn - column);
    const stepY = Math.sign(targetRow - row);
    const deltaX = spanX === 0 ? Infinity : 1 / spanX;
    const deltaY = spanY === 0 ? Infinity : 1 / spanY;
    const guardCorners = diagonals !== 'always';

    let nextX = spanX === 0 ? Infinity : deltaX / 2;
    let nextY = spanY === 0 ? Infinity : deltaY / 2;

    while (column !== targetColumn || row !== targetRow) {
      if (nextX < nextY) {
        column += stepX;
        nextX += deltaX;
      } else if (nextY < nextX) {
        row += stepY;
        nextY += deltaY;
      } else {
        if (guardCorners && (!this.fits(column + stepX, row, agentSize, clearance) || !this.fits(column, row + stepY, agentSize, clearance))) return false;

        column += stepX;
        row += stepY;
        nextX += deltaX;
        nextY += deltaY;
      }

      if (!this.fits(column, row, agentSize, clearance)) return false;
      if (costs[row * width + column]! > budget) return false;
    }

    return true;
  }

  /**
   * Brushfire clearance: how far the walkable block anchored at a cell extends
   * down and to the right. Filling it bottom-right to top-left makes it one
   * pass, because a cell only ever depends on the three cells after it.
   */
  private ensureClearance(): Uint16Array {
    const cached = this.clearance;

    if (cached !== null) return cached;

    const { width, height, costs } = this;
    const clearance = new Uint16Array(costs.length);

    for (let row = height - 1; row >= 0; row--) {
      for (let column = width - 1; column >= 0; column--) {
        const index = row * width + column;

        if (costs[index]! <= 0) continue;

        if (column === width - 1 || row === height - 1) {
          clearance[index] = 1;
          continue;
        }

        const right = clearance[index + 1]!;
        const below = clearance[index + width]!;
        const diagonal = clearance[index + width + 1]!;

        clearance[index] = Math.min(right, below, diagonal, 0xfffe) + 1;
      }
    }

    this.clearance = clearance;

    return clearance;
  }
}
