import type { Vector } from '@codexo/exojs';

import type { NavigationSpace, PathEdge } from '../types';

/** Options for {@link WaypointGraph.addEdge} and {@link WaypointGraph.connect}. */
export interface WaypointEdgeOptions<Payload = unknown> {
  /**
   * Traversal cost. Defaults to the straight-line distance between the two
   * nodes, or `1` when either of them has no position.
   */
  readonly cost?: number | undefined;
  /**
   * Free-form traversal tag surfaced through {@link PathResult.edges} - the
   * hook a movement controller reads to tell a jump from a walk. Defaults to
   * `'walk'`.
   */
  readonly kind?: string | undefined;
  /** Payload for the movement controller: jump impulse, ladder id, anything. */
  readonly data?: Payload | undefined;
}

interface Edge<Payload> {
  to: number;
  cost: number;
  kind: string;
  data: Payload | null;
}

/**
 * A directed graph of hand-placed waypoints.
 *
 * This is the representation for worlds a grid cannot describe: a platformer
 * where traversal is a topology of walk, jump and fall links rather than cell
 * walkability, or a purely abstract graph with no geometry at all. Nodes carry
 * an optional position, edges carry a cost, a {@link WaypointEdgeOptions.kind}
 * and an arbitrary payload, and the resulting path reports the edges it took so
 * the game can execute each step in its own way.
 *
 * With positions the search is A* over straight-line distance; without them the
 * heuristic is zero and the same search degrades cleanly to Dijkstra.
 */
export class WaypointGraph<Payload = unknown> implements NavigationSpace<Payload> {
  private readonly positionsX: number[] = [];
  private readonly positionsY: number[] = [];
  private readonly adjacency: Array<Array<Edge<Payload>>> = [];
  private readonly alive: boolean[] = [];
  private readonly positioned: boolean[] = [];
  private readonly freeSlots: number[] = [];
  private positionlessCount = 0;
  private largestDegree = 0;
  private currentRevision = 0;
  // Smallest ratio of an edge's cost to its straight-line length. A caller who
  // prices an edge below its geometric length (a zipline, a teleporter) would
  // otherwise make the distance heuristic overestimate and cost the search its
  // optimality; scaling by this ratio keeps it admissible instead of forbidding
  // the edge. Never raised when an edge is removed - a looser bound is still a
  // correct one, and rescanning every edge on every removal is not worth it.
  private distanceScale = 1;

  public get nodeCapacity(): number {
    return this.alive.length;
  }

  public get maxDegree(): number {
    return this.largestDegree;
  }

  public get revision(): number {
    return this.currentRevision;
  }

  /** Number of live nodes. */
  public get nodeCount(): number {
    return this.alive.length - this.freeSlots.length;
  }

  /**
   * Adds a node. Omitting the position puts the graph in Dijkstra mode: the
   * heuristic drops to zero for every query, since a positionless node makes no
   * geometric estimate meaningful.
   */
  public addNode(x?: number, y?: number): number {
    const hasPosition = x !== undefined && y !== undefined;
    const slot = this.freeSlots.pop();
    const node = slot ?? this.alive.length;

    this.positionsX[node] = x ?? 0;
    this.positionsY[node] = y ?? 0;
    this.positioned[node] = hasPosition;
    this.alive[node] = true;
    this.adjacency[node] = [];

    if (!hasPosition) this.positionlessCount++;

    this.currentRevision++;

    return node;
  }

  /**
   * Removes a node together with every edge touching it.
   *
   * Ids are recycled: a later {@link addNode} may hand out the id this call
   * freed, so a node id held across a removal can silently refer to a different
   * node.
   */
  public removeNode(node: number): void {
    if (this.alive[node] !== true) return;

    if (this.positioned[node] === false) this.positionlessCount--;

    this.alive[node] = false;
    this.adjacency[node] = [];
    this.freeSlots.push(node);

    for (let index = 0; index < this.adjacency.length; index++) {
      const edges = this.adjacency[index]!;

      for (let edge = edges.length - 1; edge >= 0; edge--) {
        if (edges[edge]!.to === node) edges.splice(edge, 1);
      }
    }

    this.currentRevision++;
  }

  /** Adds a directed edge. A second edge between the same pair replaces the first. */
  public addEdge(from: number, to: number, options: WaypointEdgeOptions<Payload> = {}): void {
    const edges = this.adjacency[from];

    if (edges === undefined || this.alive[to] !== true) return;

    const length = this.length(from, to);
    const cost = options.cost ?? (length > 0 ? length : 1);
    const edge: Edge<Payload> = { to, cost, kind: options.kind ?? 'walk', data: options.data ?? null };
    const existing = edges.findIndex(candidate => candidate.to === to);

    if (existing !== -1) edges[existing] = edge;
    else edges.push(edge);

    if (edges.length > this.largestDegree) this.largestDegree = edges.length;
    if (length > 0 && cost / length < this.distanceScale) this.distanceScale = cost / length;

    this.currentRevision++;
  }

  /** Adds the edge in both directions with the same options. */
  public connect(a: number, b: number, options: WaypointEdgeOptions<Payload> = {}): void {
    this.addEdge(a, b, options);
    this.addEdge(b, a, options);
  }

  public removeEdge(from: number, to: number): void {
    const edges = this.adjacency[from];

    if (edges === undefined) return;

    const index = edges.findIndex(candidate => candidate.to === to);

    if (index === -1) return;

    edges.splice(index, 1);
    this.currentRevision++;
  }

  public neighbors(node: number, _agentSize: number, outNodes: Int32Array, outCosts: Float64Array): number {
    const edges = this.adjacency[node];

    if (edges === undefined) return 0;

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index]!;

      outNodes[index] = edge.to;
      outCosts[index] = edge.cost;
    }

    return edges.length;
  }

  public heuristic(node: number, goal: number): number {
    if (this.positionlessCount > 0) return 0;

    return this.length(node, goal) * this.distanceScale;
  }

  public nodeToPoint(node: number, out: Vector): void {
    out.set(this.positionsX[node] ?? 0, this.positionsY[node] ?? 0);
  }

  /**
   * The positioned node closest to the point, or `-1` when the graph has none.
   * A graph has no cells, so there is no "outside" for a point to fall into.
   */
  public pointToNode(x: number, y: number): number {
    let best = -1;
    let bestDistance = Infinity;

    for (let node = 0; node < this.alive.length; node++) {
      if (this.alive[node] !== true || this.positioned[node] !== true) continue;

      const deltaX = this.positionsX[node]! - x;
      const deltaY = this.positionsY[node]! - y;
      const distance = deltaX * deltaX + deltaY * deltaY;

      if (distance >= bestDistance) continue;

      bestDistance = distance;
      best = node;
    }

    return best;
  }

  public nearestNode(x: number, y: number): number {
    return this.pointToNode(x, y);
  }

  public describeEdge(from: number, to: number): PathEdge<Payload> | null {
    const edges = this.adjacency[from];

    if (edges === undefined) return null;

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index]!;

      if (edge.to === to) return { from, to, kind: edge.kind, data: edge.data };
    }

    return null;
  }

  private length(from: number, to: number): number {
    if (this.positioned[from] !== true || this.positioned[to] !== true) return 0;

    return Math.hypot(this.positionsX[to]! - this.positionsX[from]!, this.positionsY[to]! - this.positionsY[from]!);
  }
}
