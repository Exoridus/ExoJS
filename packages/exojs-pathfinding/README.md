# @codexo/exojs-pathfinding

Weighted-grid and waypoint-graph path queries for ExoJS. Use it to find a route through your navigation model; movement, collision response, animation, and special traversal remain gameplay responsibilities.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-pathfinding
```

This is a directly used library. It has no application extension descriptor or global registration step.

## Find a route on a grid

```ts
import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';

const grid = GridSpace.from(12, 8, (x, y) => x === 5 && y !== 4 ? 0 : 1, {
  cellSize: 32,
});
const pathfinder = new Pathfinder(grid);
const route = pathfinder.findPathBetween({ x: 16, y: 16 }, { x: 336, y: 208 });

if (route.status === 'found') {
  console.log(route.waypoints);
}
```

Zero-cost cells are blocked; positive costs describe traversal weight. `findPathBetween` uses world points, whereas node-oriented queries use navigation-node identifiers. Handle an unreachable or budget-limited result explicitly instead of moving along an assumed route.

## Choose the navigation model

A grid is useful when occupancy and costs follow regular cells. A waypoint graph is useful for authored connections, directed travel, or sparse routes. An edge tagged as a ladder or teleport is metadata: the pathfinder does not animate climbing or execute the teleport.

A path is valid for the navigation revision it was computed from. Update or rebuild the appropriate navigation data when obstacles or costs change, then invalidate stale results and in-flight searches. Repeated deterministic inputs in one controlled environment are useful for testing; do not infer cross-build or cross-machine lockstep guarantees from a fixed traversal order.

Incremental query budgets bound search work, not a guaranteed number of milliseconds. Keep planning separate from the controller that follows a path, and include the agent's clearance and collision policy in the navigation model rather than treating a line through walkable cells as a complete movement solution.

## Documentation

[Grid pathfinding](https://exoridus.github.io/ExoJS/en/guide/pathfinding/grid-pathfinding/) · [Waypoint graphs](https://exoridus.github.io/ExoJS/en/guide/pathfinding/waypoint-graphs/) · [Pathfinder API](https://exoridus.github.io/ExoJS/en/api/pathfinder/)

## License

MIT © Codexo
