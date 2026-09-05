import { Vector } from '@codexo/exojs';

import { runFlood, runSearch } from './core/search';
import { SearchState } from './core/SearchState';
import type { FindPathOptions, FloodOptions, FloodRegion, NavigationSpace, PathEdge, PathResult, PrunedExpansion } from './types';

const EMPTY_NODES: readonly number[] = Object.freeze([]);
const EMPTY_POINTS: readonly Vector[] = Object.freeze([]);
const EMPTY_EDGES: ReadonlyArray<PathEdge<never>> = Object.freeze([]);

/**
 * Runs path queries against any {@link NavigationSpace}.
 *
 * One pathfinder owns the search buffers and reuses them across every query,
 * including queries against different spaces of different sizes, so a search
 * itself allocates nothing once the buffers have reached their size. The result
 * objects are freshly allocated by design: callers hold on to a path, and
 * pooling something a caller retains trades a little garbage for use-after-reuse
 * bugs.
 *
 * A pathfinder holds no world state and no lifecycle - construct one per system
 * that needs paths, or share one, as long as queries do not interleave with a
 * mutation of the space being searched.
 */
export class Pathfinder {
  private readonly state = new SearchState();
  private readonly reversed: number[] = [];

  /**
   * Finds a cost-optimal path between two node ids.
   *
   * `unreachable` yields an empty path unless {@link FindPathOptions.snapToNearest}
   * is set; `budget-exceeded` always carries the best partial path found, which
   * is a real, traversable prefix and not a guess at the rest.
   */
  public findPath<Payload>(space: NavigationSpace<Payload>, start: number, goal: number, options: FindPathOptions = {}): PathResult<Payload> {
    const agentSize = options.agentSize ?? 1;
    const budget = options.maxExpandedNodes ?? 0;
    const snapToNearest = options.snapToNearest === true;

    this.state.reserve(space.nodeCapacity, space.maxDegree);

    let expansion = options.pruning === false || space.pruning === undefined ? null : space.pruning(agentSize);
    let outcome = runSearch(this.state, space, start, goal, agentSize, budget, expansion);

    // A pruned expansion only ever settles jump points, so the closest node it
    // can name is a jump point and not the nearest reachable one. Re-running
    // unpruned costs a second search, but only on the path where the first one
    // already failed to reach the goal.
    if (outcome.status === 'unreachable' && snapToNearest && expansion !== null) {
      expansion = null;
      outcome = runSearch(this.state, space, start, goal, agentSize, budget, null);
    }

    const snapped = outcome.status === 'unreachable' && snapToNearest;

    if (outcome.status === 'unreachable' && !snapped) {
      return {
        status: 'unreachable',
        nodes: EMPTY_NODES,
        points: EMPTY_POINTS,
        edges: EMPTY_EDGES,
        cost: 0,
        revision: space.revision,
        expandedNodes: outcome.expandedNodes,
      };
    }

    const nodes: number[] = [];

    this.reconstruct(outcome.endNode, expansion, nodes);

    let path = nodes;
    let smoothed = false;

    if (options.smooth === true && space.smoothPath !== undefined) {
      path = space.smoothPath(nodes, agentSize);
      smoothed = true;
    }

    return {
      status: snapped ? 'found' : outcome.status,
      nodes: path,
      points: this.toPoints(space, path),
      // A smoothed path no longer steps along space edges, so there is nothing
      // truthful to report for it.
      edges: smoothed ? EMPTY_EDGES : this.toEdges(space, path),
      cost: outcome.cost,
      revision: space.revision,
      expandedNodes: outcome.expandedNodes,
    };
  }

  /**
   * {@link findPath} between two points instead of node ids. A point outside the
   * space makes the query `unreachable` unless
   * {@link FindPathOptions.snapToNearest} is set and the space can resolve a
   * nearest node.
   */
  public findPathBetween<Payload>(
    space: NavigationSpace<Payload>,
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    options: FindPathOptions = {},
  ): PathResult<Payload> {
    const snap = options.snapToNearest === true;
    const start = this.resolve(space, startX, startY, snap);
    const goal = this.resolve(space, goalX, goalY, snap);

    if (start < 0 || goal < 0) {
      return {
        status: 'unreachable',
        nodes: EMPTY_NODES,
        points: EMPTY_POINTS,
        edges: EMPTY_EDGES,
        cost: 0,
        revision: space.revision,
        expandedNodes: 0,
      };
    }

    return this.findPath(space, start, goal, options);
  }

  /**
   * Every node reachable from `origin` within {@link FloodOptions.maxCost}, with
   * its cost - the "tiles I can still move to this turn" query, and the input a
   * flow field for many agents heading to one goal is built from.
   */
  public floodFrom(space: NavigationSpace, origin: number, options: FloodOptions = {}): FloodRegion {
    const nodes: number[] = [];
    const costs: number[] = [];

    this.state.reserve(space.nodeCapacity, space.maxDegree);

    const expandedNodes = runFlood(this.state, space, origin, options.agentSize ?? 1, options.maxCost ?? Infinity, options.maxExpandedNodes ?? 0, nodes, costs);

    return { nodes, costs, revision: space.revision, expandedNodes };
  }

  private resolve(space: NavigationSpace, x: number, y: number, snap: boolean): number {
    const node = space.pointToNode(x, y);

    if (node >= 0 || !snap || space.nearestNode === undefined) return node;

    return space.nearestNode(x, y);
  }

  /**
   * Walks the parent chain back from `end` and writes it forwards into `out`.
   * With a pruned expansion the chain holds jump points only, so each hop is
   * handed back to the expansion to fill in the run it skipped.
   */
  private reconstruct(end: number, expansion: PrunedExpansion | null, out: number[]): void {
    const { reversed } = this;
    const { parent } = this.state;

    reversed.length = 0;

    for (let node = end; node >= 0; node = parent[node]!) {
      reversed.push(node);
    }

    out.push(reversed[reversed.length - 1]!);

    for (let index = reversed.length - 2; index >= 0; index--) {
      if (expansion === null) out.push(reversed[index]!);
      else expansion.expand(reversed[index + 1]!, reversed[index]!, out);
    }
  }

  private toPoints(space: NavigationSpace, nodes: readonly number[]): Vector[] {
    const points: Vector[] = [];

    for (let index = 0; index < nodes.length; index++) {
      const point = new Vector();

      space.nodeToPoint(nodes[index]!, point);
      points.push(point);
    }

    return points;
  }

  private toEdges<Payload>(space: NavigationSpace<Payload>, nodes: readonly number[]): ReadonlyArray<PathEdge<Payload>> {
    if (space.describeEdge === undefined) return EMPTY_EDGES;

    const edges: Array<PathEdge<Payload>> = [];

    for (let index = 1; index < nodes.length; index++) {
      const edge = space.describeEdge(nodes[index - 1]!, nodes[index]!);

      if (edge !== null) edges.push(edge);
    }

    return edges;
  }
}
