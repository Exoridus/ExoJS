import type { Vector } from '@codexo/exojs';

/**
 * Outcome of a path query.
 *
 * - `found` - a complete path from start to goal (or, with `snapToNearest`, to
 *   the reachable node closest to the goal).
 * - `unreachable` - the search exhausted the space without reaching the goal.
 * - `budget-exceeded` - `maxExpandedNodes` ran out first. The result still
 *   carries the best partial path found so far.
 */
export type PathStatus = 'found' | 'unreachable' | 'budget-exceeded';

/**
 * One traversal step of a path, as described by the space it came from.
 *
 * Spaces that model traversal kinds - {@link WaypointGraph} is the one in this
 * package - report them here, so a movement controller can react to a `'jump'`
 * step differently than to a `'walk'` step. Grid spaces describe no edges.
 */
export interface PathEdge<Payload = unknown> {
  readonly from: number;
  readonly to: number;
  /** Free-form traversal tag defined by whoever authored the space. */
  readonly kind: string;
  /** Payload the author attached to the edge, or `null`. */
  readonly data: Payload | null;
}

/** Result of {@link Pathfinder.findPath} and {@link Pathfinder.findPathBetween}. */
export interface PathResult<Payload = unknown> {
  readonly status: PathStatus;
  /**
   * Node ids from start to goal inclusive. Consecutive entries are adjacent in
   * the space unless the path was smoothed, which removes intermediate nodes by
   * design.
   */
  readonly nodes: readonly number[];
  /** {@link nodes} mapped through the space's node-to-point conversion. */
  readonly points: readonly Vector[];
  /**
   * Traversal steps for spaces that describe them, empty otherwise. Not filled
   * for smoothed paths, whose steps are no longer space edges.
   */
  readonly edges: ReadonlyArray<PathEdge<Payload>>;
  /** Total traversal cost of {@link nodes}. Smoothing does not change it. */
  readonly cost: number;
  /**
   * `space.revision` at search time. Compare it against the space's current
   * revision to detect a path that the world has invalidated since.
   */
  readonly revision: number;
  /** Nodes taken off the open list. Useful for sizing `maxExpandedNodes`. */
  readonly expandedNodes: number;
}

/** Result of {@link Pathfinder.floodFrom}: every node reached, with its cost. */
export interface FloodRegion {
  /** Reached nodes in the order the flood settled them, origin first. */
  readonly nodes: readonly number[];
  /** Traversal cost from the origin to the node at the same index. */
  readonly costs: readonly number[];
  readonly revision: number;
  readonly expandedNodes: number;
}

/** Options for {@link Pathfinder.findPath} and {@link Pathfinder.findPathBetween}. */
export interface FindPathOptions {
  /**
   * Run the space's path smoother over the result. No-op for spaces that
   * implement none. Defaults to `false`.
   */
  readonly smooth?: boolean | undefined;
  /**
   * Agent width in nodes. Spaces that model clearance restrict expansion to
   * nodes where an agent this wide fits; spaces that do not ignore it.
   * Defaults to `1`.
   */
  readonly agentSize?: number | undefined;
  /**
   * Stop after this many expanded nodes and return the best partial path with
   * status `budget-exceeded`. Defaults to `0`, meaning no budget - a search
   * over a finite space terminates regardless.
   */
  readonly maxExpandedNodes?: number | undefined;
  /**
   * When the goal cannot be reached, return the path to the reachable node
   * closest to it instead of `unreachable`. For coordinate queries this also
   * resolves a goal point outside the space to the space's nearest node.
   * Defaults to `false`.
   */
  readonly snapToNearest?: boolean | undefined;
  /**
   * Allow the space to substitute a pruned expansion (jump-point search on
   * uniform grids) for plain neighbour expansion. Both produce a cost-optimal
   * path; pruning expands far fewer nodes. Defaults to `true`.
   */
  readonly pruning?: boolean | undefined;
}

/** Options for {@link Pathfinder.floodFrom}. */
export interface FloodOptions {
  /** Highest traversal cost to include. Defaults to `Infinity`. */
  readonly maxCost?: number | undefined;
  /** Node budget, as in {@link FindPathOptions.maxExpandedNodes}. */
  readonly maxExpandedNodes?: number | undefined;
  /** Agent width in nodes, as in {@link FindPathOptions.agentSize}. */
  readonly agentSize?: number | undefined;
}

/**
 * A parent-dependent successor generator that prunes symmetric alternatives
 * without losing optimality - the shape jump-point search takes.
 *
 * Obtained from {@link NavigationSpace.pruning} for the duration of one search.
 */
export interface PrunedExpansion {
  /**
   * Writes the pruned successors of `node`, reached from `parent` (`-1` for the
   * start node), into the buffers and returns how many were written. The
   * successors may lie several nodes away; `expand` fills in what lies between.
   */
  successors(node: number, parent: number, goal: number, outNodes: Int32Array, outCosts: Float64Array): number;
  /**
   * Appends the nodes strictly between `from` and `to`, then `to` itself, to
   * `out` - turning a path of pruned successors back into a contiguous one.
   */
  expand(from: number, to: number, out: number[]): void;
}

/**
 * The search core's view of a world: integer node ids, a neighbour relation and
 * a heuristic. {@link GridSpace} and {@link WaypointGraph} implement it, and so
 * can application code - a space needs no scene node, no renderer and no asset.
 *
 * Implementations must be deterministic: the same query on an unmutated space
 * has to produce the same neighbours in the same order, or paths stop being
 * reproducible across runs and machines.
 */
export interface NavigationSpace<Payload = unknown> {
  /** One past the largest node id. Sizes the pathfinder's search buffers. */
  readonly nodeCapacity: number;
  /** Upper bound on how many neighbours one node can have. */
  readonly maxDegree: number;
  /**
   * Increments on every mutation that can invalidate a path. Carried into
   * {@link PathResult.revision} so callers can detect stale paths.
   */
  readonly revision: number;
  /**
   * Writes the neighbours of `node` and the cost of stepping to each into the
   * buffers, and returns how many were written. The buffers belong to the
   * pathfinder and are reused across nodes and searches, so an implementation
   * must not retain them.
   *
   * Costs must be positive and finite. `agentSize` is the requested clearance;
   * spaces that do not model clearance ignore it.
   */
  neighbors(node: number, agentSize: number, outNodes: Int32Array, outCosts: Float64Array): number;
  /**
   * Estimated remaining cost from `node` to `goal`. Must never overestimate, or
   * the result stops being cost-optimal; returning `0` degrades the search to
   * Dijkstra, which is the correct answer for a space without positions.
   */
  heuristic(node: number, goal: number): number;
  /** Writes the node's position into `out`. */
  nodeToPoint(node: number, out: Vector): void;
  /** The node at a point, or `-1` when the point lies outside the space. */
  pointToNode(x: number, y: number): number;
  /**
   * The node closest to a point, whether or not it is traversable and whether
   * or not the point lies inside the space. Backs `snapToNearest` for
   * coordinate queries; without it such a query reports `unreachable`.
   */
  nearestNode?(x: number, y: number): number;
  /** Describes the traversal from `from` to `to`, if the space models one. */
  describeEdge?(from: number, to: number): PathEdge<Payload> | null;
  /**
   * Returns a shortened node sequence with the same start and goal that is
   * still traversable for an agent of `agentSize`. Backs `smooth`.
   */
  smoothPath?(nodes: readonly number[], agentSize: number): number[];
  /**
   * Returns a pruned expansion valid for a search at this `agentSize`, or
   * `null` when the space cannot prune under those conditions. Called once per
   * search, so an implementation may build state here - but not per node.
   */
  pruning?(agentSize: number): PrunedExpansion | null;
}
