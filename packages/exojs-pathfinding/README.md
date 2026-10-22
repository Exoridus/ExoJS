# @codexo/exojs-pathfinding

Weighted-grid and waypoint-graph path queries for ExoJS, plus navigation agents that follow the routes. Use it to find a route through your navigation model and to move an actor along it through a movement you choose; collision response, animation, and special traversal remain the movement's and the game's responsibilities.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-pathfinding
```

This is a directly used library. It has no application extension descriptor or global registration step.

## Find a route on a grid

```ts
import { GridSpace, Pathfinder } from '@codexo/exojs/pathfinding';

const grid = GridSpace.from(12, 8, (x, y) => (x === 5 && y !== 4 ? 0 : 1), {
  cellSize: 32,
});
const pathfinder = new Pathfinder();
const route = pathfinder.findPathBetween(grid, 16, 16, 336, 208);

if (route.status === 'found') {
  console.log(route.points);
}
```

Zero-cost cells are blocked; positive costs describe traversal weight. `findPathBetween` takes the navigation space followed by the start and goal world coordinates, whereas node-oriented queries use navigation-node identifiers. Handle an unreachable or budget-limited result explicitly instead of moving along an assumed route.

## Navigate an agent

`NavigationAgentComponent` plans a route through any navigation space, progresses along it and replans when the route goes stale. It never moves its node itself: a `NavigationMovement` - anything with `maxSpeed`, `move` and `stop` - performs the motion, such as `KinematicMovementComponent` from `@codexo/exojs-physics` or a few lines that write a node position.

```ts
import { Container, type PointLike, type Seconds } from '@codexo/exojs';
import { GridSpace, NavigationAgentComponent, type NavigationMovement } from '@codexo/exojs/pathfinding';

class NodeMovement implements NavigationMovement {
  public constructor(
    private readonly node: Container,
    public readonly maxSpeed: number,
  ) {}

  public move(direction: Readonly<PointLike>, distance: number, step: Seconds): void {
    const travel = Math.min(this.maxSpeed * step, distance);

    this.node.x += direction.x * travel;
    this.node.y += direction.y * travel;
  }

  public stop(): void {}
}

const grid = GridSpace.from(12, 8, (x, y) => (x === 5 && y !== 4 ? 0 : 1), { cellSize: 32 });
const actor = new Container();
const agent = actor.addComponent(new NavigationAgentComponent({ space: grid, movement: new NodeMovement(actor, 120) }));

agent.moveTo({ x: 336, y: 208 });
agent.onStatusChange.add(status => console.log(status));
```

`follow(target)` tracks a moving target instead. The agent searches on a new command and otherwise only when the route went stale, at most once per `repathInterval`; positions, targets and directions are all in the navigation space's coordinates.

## Navigate a tile layer

`TileNavigationSpace` turns a tile layer into a navigation space with a cost callback and keeps itself in step with tile edits and chunk streaming, resampling only the chunks that changed. It reads the layer through a structural contract, so the package has no dependency on `@codexo/exojs-tilemap`.

```ts
import { TileNavigationSpace } from '@codexo/exojs/pathfinding';
import type { TileLayer } from '@codexo/exojs/tilemap';

declare const ground: TileLayer;

const navigation = new TileNavigationSpace(ground, {
  cost: tile => {
    if (tile === null) return 0;

    const definition = tile.tileset.getTileDefinition(tile.localTileId);

    return definition?.collision ? 0 : 1;
  },
});
```

Routes are in the layer's logical space, the same space tilemap physics colliders use. Orthogonal maps need square tiles; unsupported orientations are rejected.

## Choose the navigation model

A grid is useful when occupancy and costs follow regular cells. A waypoint graph is useful for authored connections, directed travel, or sparse routes. An edge tagged as a ladder or teleport is metadata: the pathfinder does not animate climbing or execute the teleport.

A path is valid for the navigation revision it was computed from. Update or rebuild the appropriate navigation data when obstacles or costs change, then invalidate stale results and in-flight searches. Repeated deterministic inputs in one controlled environment are useful for testing; do not infer cross-build or cross-machine lockstep guarantees from a fixed traversal order.

Query budgets bound search work, not a guaranteed number of milliseconds. Keep planning separate from the controller that follows a path, and include the agent's clearance and collision policy in the navigation model rather than treating a line through walkable cells as a complete movement solution.

## Documentation

[Grid pathfinding](https://exoridus.github.io/ExoJS/en/guide/pathfinding/grid-pathfinding/) · [Waypoint graphs](https://exoridus.github.io/ExoJS/en/guide/pathfinding/waypoint-graphs/) · [Navigation agents](https://exoridus.github.io/ExoJS/en/guide/pathfinding/navigation-agents/) · [Pathfinder API](https://exoridus.github.io/ExoJS/en/api/pathfinder/)

## License

MIT © Codexo
