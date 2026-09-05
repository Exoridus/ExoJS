import type { NavigationSpace, PathStatus, PrunedExpansion } from '../types';
import type { SearchState } from './SearchState';

/** What a completed search leaves behind for path reconstruction. @internal */
export interface SearchOutcome {
  status: PathStatus;
  /** Goal node when the goal was reached, otherwise the best node seen. */
  endNode: number;
  cost: number;
  expandedNodes: number;
}

/**
 * A* over a {@link NavigationSpace}, with an optional pruned expansion.
 *
 * Successors come either from `space.neighbors` or, when `expansion` is given,
 * from a parent-dependent pruned generator. Both feed the same relaxation, so
 * jump-point search is not a second solver: it is the same A* over a smaller
 * successor set.
 *
 * `endNode` is the goal on success and otherwise the reachable node with the
 * lowest heuristic, which is what makes both a budget-exceeded result and a
 * snapped result a real path rather than an empty one.
 *
 * @internal
 */
export const runSearch = (
  state: SearchState,
  space: NavigationSpace,
  start: number,
  goal: number,
  agentSize: number,
  maxExpandedNodes: number,
  expansion: PrunedExpansion | null,
): SearchOutcome => {
  const { gScore, parent, closed, neighborNodes, neighborCosts, heap } = state;

  state.begin();
  state.touch(start);
  gScore[start] = 0;

  let bestNode = start;
  let bestHeuristic = space.heuristic(start, goal);
  let expandedNodes = 0;

  heap.push(start, bestHeuristic);

  while (heap.size > 0) {
    const node = heap.pop();

    if (closed[node] === 1) continue;

    closed[node] = 1;
    expandedNodes++;

    if (node === goal) {
      return { status: 'found', endNode: goal, cost: gScore[goal]!, expandedNodes };
    }

    const heuristic = space.heuristic(node, goal);

    if (heuristic < bestHeuristic) {
      bestHeuristic = heuristic;
      bestNode = node;
    }

    if (maxExpandedNodes > 0 && expandedNodes >= maxExpandedNodes) {
      return { status: 'budget-exceeded', endNode: bestNode, cost: gScore[bestNode]!, expandedNodes };
    }

    const count =
      expansion === null
        ? space.neighbors(node, agentSize, neighborNodes, neighborCosts)
        : expansion.successors(node, parent[node]!, goal, neighborNodes, neighborCosts);
    const nodeCost = gScore[node]!;

    for (let i = 0; i < count; i++) {
      const next = neighborNodes[i]!;

      state.touch(next);

      if (closed[next] === 1) continue;

      const tentative = nodeCost + neighborCosts[i]!;

      if (tentative >= gScore[next]!) continue;

      gScore[next] = tentative;
      parent[next] = node;
      heap.push(next, tentative + space.heuristic(next, goal));
    }
  }

  return { status: 'unreachable', endNode: bestNode, cost: gScore[bestNode]!, expandedNodes };
};

/**
 * Dijkstra flood from `origin`, appending every settled node and its cost to
 * the output arrays in settle order.
 *
 * @internal
 */
export const runFlood = (
  state: SearchState,
  space: NavigationSpace,
  origin: number,
  agentSize: number,
  maxCost: number,
  maxExpandedNodes: number,
  outNodes: number[],
  outCosts: number[],
): number => {
  const { gScore, closed, neighborNodes, neighborCosts, heap } = state;

  state.begin();
  state.touch(origin);
  gScore[origin] = 0;
  heap.push(origin, 0);

  let expandedNodes = 0;

  while (heap.size > 0) {
    const node = heap.pop();

    if (closed[node] === 1) continue;

    const cost = gScore[node]!;

    if (cost > maxCost) break;

    closed[node] = 1;
    expandedNodes++;
    outNodes.push(node);
    outCosts.push(cost);

    if (maxExpandedNodes > 0 && expandedNodes >= maxExpandedNodes) break;

    const count = space.neighbors(node, agentSize, neighborNodes, neighborCosts);

    for (let i = 0; i < count; i++) {
      const next = neighborNodes[i]!;

      state.touch(next);

      if (closed[next] === 1) continue;

      const tentative = cost + neighborCosts[i]!;

      if (tentative >= gScore[next]! || tentative > maxCost) continue;

      gScore[next] = tentative;
      heap.push(next, tentative);
    }
  }

  return expandedNodes;
};
