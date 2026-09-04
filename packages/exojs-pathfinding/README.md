# @codexo/exojs-pathfinding

Official ExoJS extension for 2D pathfinding. One search core - A\* with jump-point pruning -
over pluggable navigation spaces: weighted grids for top-down worlds, waypoint graphs for
platformers and for graphs that have no geometry at all.

It is plain logic. No scene node, no renderer, no asset type, no registration step: you
construct a space and a `Pathfinder`, and you own both.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-pathfinding
```

`@codexo/exojs` is a peer dependency and the only one. In particular this package does **not**
depend on `@codexo/exojs-tilemap`: feeding a tilemap into a grid is three lines of your code,
shown below.

## What this package provides

- `Pathfinder` - runs the queries and owns the reusable search buffers.
- `GridSpace` - a finite window of weighted cells, with diagonal policies, per-cell costs,
  clearance for wide agents, string-pulling path smoothing, and a jump-point fast path.
- `WaypointGraph` - a directed graph of hand-placed nodes whose edges carry a `kind` and a
  payload, so a path can tell a jump from a walk.
- `NavigationSpace` - the interface both implement, and the one your own space implements when
  neither fits.

## Capability matrix

| Capability                          | `GridSpace`                                 | `WaypointGraph`                  |
| ----------------------------------- | ------------------------------------------- | -------------------------------- |
| Per-step costs                      | per cell, `0` blocks                        | per edge                         |
| Heuristic                           | octile / Manhattan, scaled by cheapest cell | straight-line distance           |
| Directed traversal                  | no - movement is symmetric                  | yes                              |
| Traversal kinds (`walk`/`jump`/...) | no                                          | yes, with an arbitrary payload   |
| Positionless (pure Dijkstra)        | no                                          | yes, when a node has no position |
| Clearance / wide agents             | yes, `agentSize`                            | no                               |
| Path smoothing                      | yes, string pulling                         | no                               |
| Jump-point pruning                  | yes, on a uniform-cost grid                 | no                               |
| Mutable at runtime                  | `setCost`                                   | `addNode`/`addEdge`/`remove*`    |

## Usage

```ts
import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';

const grid = GridSpace.from(64, 64, (x, y) => (isWall(x, y) ? 0 : terrainCost(x, y)), {
  cellSize: 32,
});
const pathfinder = new Pathfinder();

const result = pathfinder.findPathBetween(grid, hero.x, hero.y, target.x, target.y, {
  smooth: true,
});

if (result.status === 'found') {
  hero.follow(result.points);
}
```

`findPath` takes node ids, `findPathBetween` takes world coordinates. Both return the same
`PathResult`, and `status` is a value rather than an exception, because "no path" is an ordinary
game state:

| `status`          | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `found`           | Complete, cost-optimal path.                                         |
| `unreachable`     | The search exhausted the space. Empty path, unless `snapToNearest`.  |
| `budget-exceeded` | `maxExpandedNodes` ran out. The best partial path is still returned. |

`result.revision` records `space.revision` at search time, so a follower can notice that the
world changed under its path and ask for a new one.

## Grids

Coordinates are absolute cell coordinates - the same numbers your map uses - not offsets into
the window. The window itself is finite by construction, and everything outside it is blocked;
that is the answer for infinite or streamed maps: size the window to the region the actors are
in, and push chunk changes into it with `setCost`.

```ts
// Streamed tilemap, no package dependency in either direction.
const window = GridSpace.from(96, 96, (x, y) => walkCost(map.getTileAt(layerId, x, y)), {
  originX: chunkX * 32,
  originY: chunkY * 32,
  cellSize: map.tileWidth,
});

map.onTileChanged(({ x, y, tile }) => window.setCost(x, y, walkCost(tile)));
```

Cost `0` blocks a cell, `1` is ordinary ground, larger values are terrain the search routes
around when the detour is cheaper. Diagonal steps cost their length, and the default diagonal
policy (`'no-corner-cutting'`) forbids the diagonal that would clip through the corner where two
walls meet.

`agentSize` restricts a query to cells where an agent that many cells wide fits. Clearance is
anchored at a cell's **top-left** corner, so the last row and column of a window can never hold
an agent wider than one cell.

## Jump-point search

`GridSpace` substitutes jump-point search for plain neighbour expansion whenever the grid is
uniform-cost, `agentSize` is `1`, and the diagonal policy is the default. It returns the same
cost-optimal path while expanding a fraction of the nodes; `result.expandedNodes` shows the
difference. Nothing has to be switched on, and `{ pruning: false }` switches it off.

Because pruning settles only jump points, a `budget-exceeded` partial path under pruning ends on
a jump point rather than on the nearest cell. `snapToNearest` is unaffected: when the goal turns
out to be unreachable, the query re-runs unpruned so the snapped node really is the closest one.

## Waypoint graphs

```ts
import { Pathfinder, WaypointGraph } from '@codexo/exojs-pathfinding';

interface Move {
  readonly impulse: number;
}

const graph = new WaypointGraph<Move>();
const ledge = graph.addNode(120, 400);
const platform = graph.addNode(320, 260);

graph.connect(ledge, platform, { kind: 'jump', data: { impulse: 520 }, cost: 40 });

for (const step of new Pathfinder().findPath(graph, ledge, platform).edges) {
  controller.execute(step.kind, step.data);
}
```

Node positions are optional. Leave them out and the heuristic drops to zero, which turns the
same search into plain Dijkstra over an abstract graph - the shape a web application's routing
problem usually has.

## Reachable-area queries

`floodFrom` returns every node within a cost budget, cheapest first: the "tiles I can still
reach with the movement points I have left" query, and the input a flow field would be built
from.

```ts
const region = pathfinder.floodFrom(grid, grid.nodeAt(unit.tileX, unit.tileY), { maxCost: 6 });

for (const node of region.nodes) {
  highlight(grid.nodeX(node), grid.nodeY(node));
}
```

## Determinism and allocation

Equal-cost paths are resolved by a pinned tie-break (lower node id first), so the same query on
an unmutated space returns the identical path on every machine and every run - which is what
makes paths safe to record in a replay or assert in a test.

A `Pathfinder` owns its search state and reuses it across queries, including queries against
different spaces of different sizes. Once the buffers have grown to fit, a search allocates
nothing that scales with the number of nodes it visits. The result object is allocated fresh
every time, deliberately: callers keep paths, and pooling something a caller keeps buys a little
garbage back at the price of use-after-reuse bugs.

## Custom spaces

Implement `NavigationSpace` and every query in this package works against it. `neighbors`
receives the pathfinder's own buffers instead of returning an array, so a third-party space is
allocation-free on the same terms as the built-in ones.

## License

MIT
