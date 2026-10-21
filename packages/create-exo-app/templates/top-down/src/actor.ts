import { Container, type PointLike, Vector } from '@codexo/exojs';
import { NavigationAgentComponent, type TileNavigationSpace } from '@codexo/exojs/pathfinding';
import { CircleShape, KinematicMovementComponent, type PhysicsBody, PhysicsBodyComponent, type PhysicsWorld } from '@codexo/exojs/physics';
import type { ResolvedTile } from '@codexo/exojs/tilemap';

export interface ActorOptions {
  /** Where the actor's centre starts, in world pixels. */
  readonly position: PointLike;
  /** Collision radius, in pixels. Navigation keeps the actor to corridors at least this wide on both sides. */
  readonly radius: number;
  /** Walking speed, in pixels per second. */
  readonly speed: number;
}

/**
 * A circular character that walks the level: a kinematic body that the tile
 * colliders stop, and a navigation agent that routes it around them.
 *
 * Both read the same `Walls` layer. Navigation treats a cell with any
 * collision shape as fully blocked, so with whole-tile shapes a route it plans
 * is one the body can walk; a partial shape only makes routes more cautious.
 */
export interface Actor {
  /** The scene node the body moves; attach visuals to it as children. */
  readonly node: Container;
  readonly body: PhysicsBody;
  readonly movement: KinematicMovementComponent;
  /**
   * Steers the actor. It works in navigation space, which is world space
   * shifted by {@link offset}: its path, destination and position read that
   * much up and left of the body. Command the actor through {@link moveTo} and
   * {@link follow}, which convert.
   */
  readonly agent: NavigationAgentComponent;
  readonly radius: number;
  /** Width, in tiles, of the square of free cells the actor needs to pass. */
  readonly footprint: number;
  /** How far navigation space is shifted up and left of world space, in pixels. */
  readonly offset: number;
  /**
   * Walks the actor to the tile under `point`, in world pixels. The actor
   * stops in the middle of the free square of {@link footprint} tiles that
   * covers that tile and lies closest to `point`, not on `point` itself: a
   * spot beside a wall is one the body cannot stand on. A tile no such square
   * covers, such as a wall, ends as `unreachable`.
   */
  moveTo(point: PointLike): void;
  /** Keeps walking after `target`, a live world-space position such as another actor's body. */
  follow(target: PointLike): void;
}

/**
 * The navigation-space centre of the free square of `footprint` cells that
 * covers the cell under `point` and lies closest to it, or the cell under
 * `point` when no free square covers it, so the route search reports it.
 */
const standingPoint = (navigation: TileNavigationSpace<ResolvedTile>, footprint: number, point: PointLike): Vector => {
  const size = navigation.cellSize;
  const column = Math.floor(point.x / size);
  const row = Math.floor(point.y / size);
  const offset = ((footprint - 1) * size) / 2;
  const best = new Vector((column + 0.5) * size - offset, (row + 0.5) * size - offset);
  let bestDistance = Infinity;

  // A door edit earlier in this step is not in the grid until it syncs.
  navigation.sync();

  for (let top = row - footprint + 1; top <= row; top++) {
    for (let left = column - footprint + 1; left <= column; left++) {
      if (!isFree(navigation, left, top, footprint)) {
        continue;
      }

      const distance = Math.hypot((left + footprint / 2) * size - point.x, (top + footprint / 2) * size - point.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        best.set((left + 0.5) * size, (top + 0.5) * size);
      }
    }
  }

  return best;
};

const isFree = (navigation: TileNavigationSpace<ResolvedTile>, left: number, top: number, footprint: number): boolean => {
  for (let row = top; row < top + footprint; row++) {
    for (let column = left; column < left + footprint; column++) {
      if (!navigation.isWalkable(column, row)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Creates an {@link Actor} on `parent`, colliding in `world` and routing
 * through `navigation`.
 *
 * Routes are planned for the smallest square of whole tiles the actor's
 * diameter fits in. The pathfinder measures that square from its top-left
 * cell, so for an actor wider than one tile the navigation agent sees a
 * position, and receives destinations, shifted by half the extra width:
 * steering the body's centre along the square's corner cell instead would
 * walk it into the wall beside that cell, and would test the wrong cells for
 * a destination next to a wall.
 */
export const spawnActor = (
  parent: Container,
  world: PhysicsWorld,
  navigation: TileNavigationSpace<ResolvedTile>,
  options: ActorOptions,
): Actor => {
  const { position, radius, speed } = options;
  const footprint = Math.max(1, Math.ceil((radius * 2) / navigation.cellSize));
  const offset = ((footprint - 1) * navigation.cellSize) / 2;
  const node = new Container();

  node.setPosition(position.x, position.y);

  const physics = node.addComponent(
    new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(radius) }] }),
  );
  const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: speed }));
  const body = physics.body;
  const shifted = (point: PointLike): PointLike => ({
    get x() {
      return point.x - offset;
    },
    get y() {
      return point.y - offset;
    },
  });
  const agent = node.addComponent(
    new NavigationAgentComponent({
      space: navigation,
      movement,
      position: shifted(body),
      search: { smooth: true, agentSize: footprint },
      arrivalDistance: 2,
    }),
  );

  parent.addChild(node);

  return {
    node,
    body,
    movement,
    agent,
    radius,
    footprint,
    offset,
    moveTo: point => agent.moveTo(standingPoint(navigation, footprint, point)),
    follow: target => agent.follow(shifted(target)),
  };
};
