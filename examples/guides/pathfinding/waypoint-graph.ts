import { Pathfinder, WaypointGraph } from '@codexo/exojs-pathfinding';

declare const controller: { walkTo: (x: number, y: number) => void; jump: (impulse: number) => void };

// #region guide:waypoint-graph
interface Move {
  readonly impulse: number;
}

const graph = new WaypointGraph<Move>();

const ledge = graph.addNode(120, 400);
const gap = graph.addNode(240, 400);
const platform = graph.addNode(420, 260);

graph.connect(ledge, gap); // cost defaults to the straight-line distance
graph.addEdge(gap, platform, { kind: 'jump', cost: 90, data: { impulse: 520 } });
graph.addEdge(platform, gap, { kind: 'fall', cost: 30 });
// #endregion guide:waypoint-graph

// #region guide:waypoint-follow
const route = new Pathfinder().findPath(graph, ledge, platform);

for (let index = 0; index < route.edges.length; index++) {
  const step = route.edges[index]!;
  const arrival = route.points[index + 1]!;

  if (step.kind === 'jump' && step.data !== null) controller.jump(step.data.impulse);
  else controller.walkTo(arrival.x, arrival.y);
}
// #endregion guide:waypoint-follow

// #region guide:dijkstra-mode
// No positions: the heuristic is zero and the same search is plain Dijkstra
// over an abstract graph.
const routing = new WaypointGraph();
const cache = routing.addNode();
const origin = routing.addNode();

routing.connect(origin, cache, { cost: 12 });
// #endregion guide:dijkstra-mode
