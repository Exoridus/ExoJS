import type { PrunedExpansion } from '../types';
import { DIRECTION_X, DIRECTION_Y, runLength } from './gridGeometry';

/**
 * Jump-point search over a uniform-cost grid with corner cutting disallowed.
 *
 * Instead of every walkable neighbour, a node reports only the *jump points*
 * reachable from it: the first cell along each surviving direction where the
 * obstacle layout makes a turn worth considering. Everything between two jump
 * points is a forced straight or diagonal run, so the search skips it entirely
 * and expands orders of magnitude fewer nodes for the same optimal path.
 *
 * The pruning rules below are the corner-cutting-free ones and differ from the
 * textbook formulation, which assumes a diagonal may pass between two blocked
 * cells. Under the stricter rule the step into a node guarantees that both
 * cells beside its predecessor are walkable, so a diagonal step has no forced
 * neighbours at all, and a straight step gains them from the cell diagonally
 * *behind* it being blocked rather than the one beside it.
 *
 * @internal
 */
export class GridJumpExpansion implements PrunedExpansion {
  private readonly costs: Float32Array;
  private readonly width: number;
  private readonly height: number;

  public constructor(costs: Float32Array, width: number, height: number) {
    this.costs = costs;
    this.width = width;
    this.height = height;
  }

  public successors(node: number, parent: number, goal: number, outNodes: Int32Array, outCosts: Float64Array): number {
    const { width } = this;
    const x = node % width;
    const y = (node / width) | 0;
    const goalX = goal % width;
    const goalY = (goal / width) | 0;

    let count = 0;

    if (parent < 0) {
      for (let direction = 0; direction < 8; direction++) {
        count = this.emit(x, y, DIRECTION_X[direction]!, DIRECTION_Y[direction]!, goalX, goalY, outNodes, outCosts, count);
      }

      return count;
    }

    const stepX = Math.sign(x - (parent % width));
    const stepY = Math.sign(y - ((parent / width) | 0));

    if (stepX !== 0 && stepY !== 0) {
      count = this.emit(x, y, stepX, 0, goalX, goalY, outNodes, outCosts, count);
      count = this.emit(x, y, 0, stepY, goalX, goalY, outNodes, outCosts, count);

      return this.emit(x, y, stepX, stepY, goalX, goalY, outNodes, outCosts, count);
    }

    // The side loops below are unrolled rather than iterated: this runs once per
    // expanded node, and a `for...of` over a two-element array would allocate a
    // fresh iterator every time.
    if (stepY === 0) {
      count = this.emit(x, y, stepX, 0, goalX, goalY, outNodes, outCosts, count);

      if (!this.walkable(x - stepX, y + 1)) {
        count = this.emit(x, y, 0, 1, goalX, goalY, outNodes, outCosts, count);
        count = this.emit(x, y, stepX, 1, goalX, goalY, outNodes, outCosts, count);
      }

      if (!this.walkable(x - stepX, y - 1)) {
        count = this.emit(x, y, 0, -1, goalX, goalY, outNodes, outCosts, count);
        count = this.emit(x, y, stepX, -1, goalX, goalY, outNodes, outCosts, count);
      }

      return count;
    }

    count = this.emit(x, y, 0, stepY, goalX, goalY, outNodes, outCosts, count);

    if (!this.walkable(x + 1, y - stepY)) {
      count = this.emit(x, y, 1, 0, goalX, goalY, outNodes, outCosts, count);
      count = this.emit(x, y, 1, stepY, goalX, goalY, outNodes, outCosts, count);
    }

    if (!this.walkable(x - 1, y - stepY)) {
      count = this.emit(x, y, -1, 0, goalX, goalY, outNodes, outCosts, count);
      count = this.emit(x, y, -1, stepY, goalX, goalY, outNodes, outCosts, count);
    }

    return count;
  }

  public expand(from: number, to: number, out: number[]): void {
    const { width } = this;
    const targetX = to % width;
    const targetY = (to / width) | 0;

    let x = from % width;
    let y = (from / width) | 0;

    const stepX = Math.sign(targetX - x);
    const stepY = Math.sign(targetY - y);

    while (x !== targetX || y !== targetY) {
      x += stepX;
      y += stepY;
      out.push(y * width + x);
    }
  }

  private walkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;

    return this.costs[y * this.width + x]! > 0;
  }

  private emit(
    x: number,
    y: number,
    stepX: number,
    stepY: number,
    goalX: number,
    goalY: number,
    outNodes: Int32Array,
    outCosts: Float64Array,
    count: number,
  ): number {
    const jump = this.jump(x, y, stepX, stepY, goalX, goalY);

    if (jump < 0) return count;

    outNodes[count] = jump;
    outCosts[count] = runLength(Math.abs((jump % this.width) - x), Math.abs(((jump / this.width) | 0) - y));

    return count + 1;
  }

  /**
   * Runs from `(x, y)` in one direction until it hits the goal, a cell with a
   * forced neighbour, or a wall. Returns the node it stopped on, or `-1` when
   * the run died against an obstacle without passing anything worth expanding.
   */
  private jump(x: number, y: number, stepX: number, stepY: number, goalX: number, goalY: number): number {
    const { width } = this;

    let currentX = x;
    let currentY = y;

    for (;;) {
      const nextX = currentX + stepX;
      const nextY = currentY + stepY;

      if (!this.walkable(nextX, nextY)) return -1;
      if (stepX !== 0 && stepY !== 0 && (!this.walkable(nextX, currentY) || !this.walkable(currentX, nextY))) return -1;
      if (nextX === goalX && nextY === goalY) return nextY * width + nextX;

      if (stepY === 0) {
        if (this.forcedBeside(currentX, nextX, nextY, 1) || this.forcedBeside(currentX, nextX, nextY, -1)) return nextY * width + nextX;
      } else if (stepX === 0) {
        if (this.forcedAbove(currentY, nextY, nextX, 1) || this.forcedAbove(currentY, nextY, nextX, -1)) return nextY * width + nextX;
      } else if (this.jump(nextX, nextY, stepX, 0, goalX, goalY) >= 0 || this.jump(nextX, nextY, 0, stepY, goalX, goalY) >= 0) {
        return nextY * width + nextX;
      }

      currentX = nextX;
      currentY = nextY;
    }
  }

  /**
   * Horizontal run: the cell beside the node is only worth turning into when
   * the cell diagonally behind it is blocked, because otherwise the predecessor
   * reaches it at least as cheaply without passing through this node.
   */
  private forcedBeside(previousX: number, x: number, y: number, side: number): boolean {
    return !this.walkable(previousX, y + side) && this.walkable(x, y + side);
  }

  /** Vertical run; the mirror of {@link forcedBeside}. */
  private forcedAbove(previousY: number, y: number, x: number, side: number): boolean {
    return !this.walkable(x + side, previousY) && this.walkable(x + side, y);
  }
}
