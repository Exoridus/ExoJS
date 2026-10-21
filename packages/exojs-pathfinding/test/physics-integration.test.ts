import {
  type Application,
  Container,
  logger,
  Scene,
  SceneDirector,
  Signal,
  SystemOrder,
  type Texture,
  TextureRegion,
  Time,
} from '@codexo/exojs';
import {
  BoxShape,
  CharacterMovementComponent,
  CircleShape,
  KinematicMovementComponent,
  PhysicsBody,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '@codexo/exojs/physics';
import { type ResolvedTile, TILE_TRANSFORM_IDENTITY, TileLayer, TileSet } from '@codexo/exojs/tilemap';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { NavigationAgentComponent } from '../src/navigation/NavigationAgentComponent';
import type { NavigationMovement } from '../src/navigation/NavigationMovement';
import { TileNavigationSpace } from '../src/tilemap/TileNavigationSpace';

const STEP = Time.seconds(1 / 60);
const TILE = 16;
const FLOOR = 0;
const WALL = 1;

const ARENA = ['..........', '....#.....', '....#.....', '....#.....', '....#.....', '..........'];

class ArenaScene extends Scene {
  public readonly world = new PhysicsWorld();

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
  }
}

const fakeTexture = (): Texture =>
  ({ width: 64, height: 64, uid: 0, label: 'test', destroy: () => {}, destroyed: false }) as unknown as Texture;

const tileset = new TileSet({
  name: 'arena',
  texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 64, height: 64 }),
  tileWidth: TILE,
  tileHeight: TILE,
  tileCount: 2,
});

const cost = (tile: ResolvedTile | null): number => (tile === null || tile.localTileId === WALL ? 0 : 1);

const setup = async () => {
  const onError = new Signal<[Error]>();
  const app = {
    loader: { _releaseScope: vi.fn() },
    interaction: { attachRoot: vi.fn(), detachRoot: vi.fn(), attachUIRoot: vi.fn(), detachUIRoot: vi.fn() },
    onError,
  } as unknown as Application;
  const director = new SceneDirector(app, { arena: ArenaScene });

  onError.add(error => {
    throw error;
  });
  await director.change(ArenaScene);

  const scene = director.currentScene as ArenaScene;
  const layer = new TileLayer({ id: 1, name: 'ground', width: 10, height: 6, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset] });

  ARENA.forEach((row, y) =>
    [...row].forEach((cell, x) =>
      layer.setTileAt(x, y, { tileset, localTileId: cell === '#' ? WALL : FLOOR, transform: TILE_TRANSFORM_IDENTITY }),
    ),
  );

  // The physical walls mirror the map, the way a tile collider bridge would build them.
  const walls = new PhysicsBody({ type: 'static' });

  ARENA.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      if (cell === '#') {
        walls.addCollider({ shape: new BoxShape(TILE, TILE), offset: { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE } });
      }
    }),
  );
  scene.world.add(walls);

  const navigation = new TileNavigationSpace(layer, { cost });
  const node = new Container();

  node.setPosition(1.5 * TILE, 2.5 * TILE);

  const physics = node.addComponent(
    new PhysicsBodyComponent(scene.world, { type: 'kinematic', colliders: [{ shape: new CircleShape(5) }] }),
  );
  const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 90 }));
  const agent = node.addComponent(
    new NavigationAgentComponent({ space: navigation, movement, position: physics.body, search: { smooth: true } }),
  );

  scene.addChild(node);

  const frame = (): void => {
    director._beginFrame();
    director.fixedUpdate(STEP);
    director.update(STEP);
    director._endFrame();
  };

  const runUntil = (done: () => boolean, limit = 1200): void => {
    for (let i = 0; i < limit; i++) {
      frame();

      if (done()) {
        return;
      }
    }

    throw new Error(`condition not met within ${limit} frames (status ${agent.status})`);
  };

  return { director, scene, layer, navigation, node, physics, movement, agent, frame, runUntil };
};

describe('navigation over a tilemap with physics-backed movement', () => {
  it('takes the kinematic movement as its movement contract', () => {
    expectTypeOf<KinematicMovementComponent>().toMatchTypeOf<NavigationMovement>();
  });

  it('walks around the wall to a fixed destination and stops there', async () => {
    const { node, physics, agent, runUntil } = await setup();

    agent.moveTo({ x: 8.5 * TILE, y: 2.5 * TILE });
    runUntil(() => agent.status === 'arrived');

    expect(physics.body.x).toBeCloseTo(8.5 * TILE, 6);
    expect(physics.body.y).toBeCloseTo(2.5 * TILE, 6);
    expect(node.x).toBe(physics.body.x);
    expect(physics.body.linearVelocityX).toBe(0);
  });

  it('stops on its destination when the world is stepped manually several steps at a time', async () => {
    const { director, scene, physics, agent } = await setup();
    const destination = { x: 8.5 * TILE, y: 2.5 * TILE };

    // Take the world out of the scene's systems and step it once per frame
    // for two fixed steps, the catch-up a slow frame causes.
    scene.systems.remove(scene.world);
    agent.moveTo(destination);

    let farthest = 0;

    for (let frame = 0; frame < 600 && agent.status !== 'arrived'; frame++) {
      director._beginFrame();
      director.fixedUpdate(STEP);
      director.fixedUpdate(STEP);
      director._endFrame();
      scene.world.step(2 / 60 + 1e-9);
      farthest = Math.max(farthest, physics.body.x);
    }

    expect(agent.status).toBe('arrived');
    expect(farthest).toBeLessThanOrEqual(destination.x + 1e-6);
    expect(physics.body.x).toBeCloseTo(destination.x, 6);
    expect(physics.body.y).toBeCloseTo(destination.y, 6);
  });

  it('refuses to steer a movement a character drives, and steers it again once the character is disabled', async () => {
    const { node, physics, movement, agent, frame, runUntil } = await setup();
    const character = node.addComponent(new CharacterMovementComponent(movement, { up: { x: 0, y: -1 }, gravity: 0 }));

    // One movement authority per body: the navigation command is rejected
    // rather than merged with the character's.
    agent.moveTo({ x: 8.5 * TILE, y: 2.5 * TILE });
    expect(() => frame()).toThrow(/CharacterMovementComponent drives this movement/);

    character.enabled = false;
    runUntil(() => agent.status === 'arrived');
    expect(physics.body.x).toBeCloseTo(8.5 * TILE, 6);
  });

  it('stops its agents without errors when the tile layer is destroyed', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { layer, navigation, physics, agent, frame } = await setup();

    agent.moveTo({ x: 8.5 * TILE, y: 2.5 * TILE });

    for (let i = 0; i < 10; i++) {
      frame();
    }

    layer.destroy();

    for (let i = 0; i < 30; i++) {
      frame();
    }

    expect(navigation.invalidated).toBe(true);
    expect(agent.status).toBe('unreachable');
    expect(physics.body.linearVelocityX).toBe(0);
    expect(physics.body.linearVelocityY).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('follows a moving body and replans when a tile closes the route', async () => {
    const { scene, layer, navigation, physics, agent, frame, runUntil } = await setup();
    const target = new PhysicsBody({
      type: 'kinematic',
      position: { x: 8.5 * TILE, y: 0.5 * TILE },
      colliders: [{ shape: new CircleShape(2), isSensor: true }],
    });

    scene.world.add(target);
    agent.follow(target);

    for (let i = 0; i < 20; i++) {
      frame();
    }

    const revision = navigation.revision;

    // Close the top gap the route was about to take; the bottom one stays open.
    layer.setTileAt(4, 0, { tileset, localTileId: WALL, transform: TILE_TRANSFORM_IDENTITY });
    expect(navigation.revision).toBeGreaterThan(revision);

    runUntil(() => agent.status === 'arrived');
    expect(agent.path!.points.some(point => point.y > 5 * TILE)).toBe(true);

    target.setTransform({ x: 8.5 * TILE, y: 4.5 * TILE });
    runUntil(() => agent.status === 'arrived' && Math.abs(physics.body.y - 4.5 * TILE) < 1e-6);
    expect(physics.body.x).toBeCloseTo(8.5 * TILE, 6);
  });
});
