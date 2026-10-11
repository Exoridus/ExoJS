import { BehaviorComponent, type Container, type PointLike, type Seconds, type VectorAction } from '@codexo/exojs';
import { NavigationAgentComponent, type NavigationMovement, TileNavigationSpace, WaypointGraph } from '@codexo/exojs-pathfinding';
import { CircleShape, KinematicMovementComponent, PhysicsBodyComponent, type PhysicsWorld } from '@codexo/exojs-physics';
import type { ResolvedTile, TileLayer } from '@codexo/exojs-tilemap';

declare const world: PhysicsWorld;
declare const ground: TileLayer;
declare const hero: Container;
declare const hunter: Container;
declare const courier: Container;
declare const moveAction: VectorAction;

// #region guide:kinematic-movement
const heroPhysics = hero.addComponent(new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(16) }] }));
const heroMovement = hero.addComponent(new KinematicMovementComponent(heroPhysics, { maxSpeed: 240 }));

// A command covers one world step, so issue it every fixed step. Fixed
// updates run before a scene's systems, which is where the world steps.
class PlayerControl extends BehaviorComponent {
  public override fixedUpdate(): void {
    heroMovement.move(moveAction.value);
  }
}

hero.addComponent(new PlayerControl());
// #endregion guide:kinematic-movement

// #region guide:tile-navigation
const navigation = new TileNavigationSpace(ground, {
  cost: tile => {
    if (tile === null) {
      return 0;
    }

    const definition = tile.tileset.getTileDefinition(tile.localTileId);

    return definition?.collision ? 0 : 1;
  },
});

// Edit the layer as usual. The navigation space notices the new revision on
// its next read and resamples only the chunk that changed.
const closeDoor = (x: number, y: number, door: ResolvedTile): void => {
  ground.setTileAt(x, y, door);
};
// #endregion guide:tile-navigation

// #region guide:navigation-agent
const hunterPhysics = hunter.addComponent(
  new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(14) }] }),
);
const hunterMovement = hunter.addComponent(new KinematicMovementComponent(hunterPhysics, { maxSpeed: 160 }));
const agent = hunter.addComponent(
  new NavigationAgentComponent({
    space: navigation,
    movement: hunterMovement,
    // Read where the body is, not where the node was last drawn.
    position: hunterPhysics.body,
    search: { smooth: true },
    // Two bodies cannot overlap; touching is close enough.
    arrivalDistance: 16 + 14 + 2,
  }),
);

agent.moveTo({ x: 500, y: 300 });
agent.follow(heroPhysics.body);
agent.onStatusChange.add(status => {
  if (status === 'unreachable') {
    agent.stop();
  }
});
// #endregion guide:navigation-agent

// #region guide:custom-movement
/** Moves a node directly - no physics, no collision. */
class NodeMovement implements NavigationMovement {
  public constructor(
    private readonly node: Container,
    public readonly maxSpeed: number,
  ) {}

  public move(direction: Readonly<PointLike>, step: Seconds): void {
    this.node.x += direction.x * this.maxSpeed * step;
    this.node.y += direction.y * this.maxSpeed * step;
  }

  public stop(): void {
    // Nothing keeps moving here between steps, so there is nothing to stop.
  }
}

const roads = new WaypointGraph();
const depot = roads.addNode(80, 80);
const market = roads.addNode(640, 80);

roads.connect(depot, market);
courier.addComponent(new NavigationAgentComponent({ space: roads, movement: new NodeMovement(courier, 120) })).moveTo({ x: 640, y: 80 });
// #endregion guide:custom-movement

void closeDoor;
