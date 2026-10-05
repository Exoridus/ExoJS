import { Container, Scene, SceneDirector, SystemOrder } from '@codexo/exojs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { BoxShape, CircleShape, DistanceJoint, MouseJoint, PhysicsBody, PhysicsBodyComponent, PhysicsWorld } from '../src/index';
import { createAppStub } from './sceneHarness';

const DT = 1 / 60;

class WorldScene extends Scene {
  public readonly world = new PhysicsWorld();

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
  }
}

class OtherScene extends Scene {}

const box = (options: ConstructorParameters<typeof PhysicsBody>[0] = {}) => ({ colliders: [{ shape: new BoxShape(10, 10) }], ...options });

/** A director with WorldScene active. */
const worldScene = async () => {
  const { app, errors } = createAppStub();
  const director = new SceneDirector(app, { world: WorldScene, other: OtherScene });

  await director.change(WorldScene);

  return { director, errors, scene: director.currentScene as WorldScene };
};

describe('PhysicsBodyComponent', () => {
  it('creates its body at construction, outside any world', () => {
    const world = new PhysicsWorld();
    const physics = new PhysicsBodyComponent(world, box());

    expect(physics.world).toBe(world);
    expect(physics.body).toBeInstanceOf(PhysicsBody);
    expect(physics.body.attached).toBe(false);
    expectTypeOf(new Container().addComponent(physics)).toEqualTypeOf<PhysicsBodyComponent>();
    expectTypeOf(physics.body).toEqualTypeOf<PhysicsBody>();
  });

  it('joins the world and drives the node while active', async () => {
    const { scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box({ type: 'kinematic' })));

    scene.addChild(node);
    expect(physics.active).toBe(true);
    expect(scene.world.bodies).toContain(physics.body);

    physics.body.setTransform({ x: 40, y: 50 });
    scene.world.step(DT);
    expect([node.x, node.y]).toEqual([40, 50]);
    expect(node.getComponent(PhysicsBodyComponent)).toBe(physics);
    expect(scene.query(PhysicsBodyComponent).size).toBe(1);
  });

  it('places the body at the node on first activation unless a position is given', async () => {
    const { scene } = await worldScene();
    const adopted = new Container();
    const explicit = new Container();

    adopted.setPosition(30, 40);
    explicit.setPosition(30, 40);

    const fromNode = adopted.addComponent(new PhysicsBodyComponent(scene.world, box()));
    const fromOptions = explicit.addComponent(new PhysicsBodyComponent(scene.world, box({ position: { x: 5, y: 6 } })));

    scene.addChild(adopted);
    scene.addChild(explicit);

    expect([fromNode.body.x, fromNode.body.y]).toEqual([30, 40]);
    expect([fromOptions.body.x, fromOptions.body.y]).toEqual([5, 6]);
    expect([explicit.x, explicit.y]).toEqual([5, 6]);
  });

  it('destroys its body with the node', async () => {
    const { scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(node);
    node.destroy();

    expect(physics.body.destroyed).toBe(true);
    expect(scene.world.bodies).not.toContain(physics.body);
  });

  it('leaves the world on disable and returns with its state on enable', async () => {
    const { scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(node);
    physics.body.linearVelocityX = 120;
    physics.enabled = false;

    expect(physics.body.attached).toBe(false);
    expect(physics.body.destroyed).toBe(false);
    expect(scene.world.bodies).not.toContain(physics.body);

    physics.enabled = true;

    expect(scene.world.bodies).toContain(physics.body);
    expect(physics.body.linearVelocityX).toBe(120);
    expect(physics.body.isSleeping).toBe(false);
  });

  it('keeps its velocity when the node is reparented within the scene', async () => {
    const { scene } = await worldScene();
    const from = new Container();
    const to = new Container();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(from);
    scene.addChild(to);
    from.addChild(node);
    physics.body.linearVelocityY = -75;

    to.addChild(node);

    expect(node.parent).toBe(to);
    expect(physics.active).toBe(true);
    expect(physics.body.attached).toBe(true);
    expect(physics.body.linearVelocityY).toBe(-75);

    scene.world.step(DT);
    expect(node.y).toBe(physics.body.y);
  });

  it('leaves the world while its scene is retained and returns on restore', async () => {
    const { director, scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(node);
    await director.change(OtherScene, { suspendCurrent: true });

    expect(physics.body.attached).toBe(false);
    expect(physics.body.destroyed).toBe(false);

    await director.restore(WorldScene);

    expect(physics.body.attached).toBe(true);
    expect(scene.world.bodies).toContain(physics.body);
  });

  it('stays in the world while its scene is paused', async () => {
    const { director, scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));
    const remove = vi.spyOn(scene.world, 'remove');

    scene.addChild(node);
    director.pause();

    expect(physics.active).toBe(true);
    expect(physics.body.attached).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('ends cleanly with a scene that owns the world', async () => {
    const { director, errors, scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(node);
    await director.change(OtherScene);

    expect(errors).toEqual([]);
    expect(physics.body.destroyed).toBe(true);
  });

  it('ends cleanly with a scene while a shared world keeps running without the body', async () => {
    const shared = new PhysicsWorld();
    let releaseUnload!: () => void;
    let unloading = false;

    class SlowScene extends Scene {
      public override unload(): Promise<void> {
        unloading = true;

        return new Promise<void>(resolve => {
          releaseUnload = resolve;
        });
      }
    }

    const { app, errors } = createAppStub();
    const director = new SceneDirector(app, { slow: SlowScene, other: OtherScene });

    await director.change(SlowScene);

    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(shared, box({ type: 'kinematic', position: { x: 10, y: 10 } })));

    director.currentScene!.addChild(node);

    const switching = director.change(OtherScene);

    await vi.waitFor(() => expect(unloading).toBe(true));

    // The scene is still unloading: the body must already be out of the shared world.
    expect(shared.bodies).not.toContain(physics.body);
    expect(shared.queryPoint({ x: 10, y: 10 })).toEqual([]);
    physics.body.setTransform({ x: 99, y: 99 });
    shared.step(DT);
    expect([node.x, node.y]).toEqual([10, 10]);

    releaseUnload();
    await switching;

    expect(errors).toEqual([]);
    expect(physics.body.destroyed).toBe(true);
    expect(() => shared.step(DT)).not.toThrow();
  });

  it('survives its world being destroyed first', async () => {
    const { scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    scene.addChild(node);
    scene.world.destroy();

    expect(physics.body.destroyed).toBe(true);
    expect(() => node.destroy()).not.toThrow();
  });

  it('destroys a body that never joined a world', () => {
    const world = new PhysicsWorld();
    const add = vi.spyOn(world, 'add');
    const physics = new Container().addComponent(new PhysicsBodyComponent(world, box()));

    physics.destroy();

    expect(physics.body.destroyed).toBe(true);
    expect(physics.body.colliders[0]!.destroyed).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it('does not stay in the world when binding its node fails', async () => {
    const { scene } = await worldScene();
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, box()));

    node.skewX = 10;

    try {
      scene.addChild(node);
    } catch {
      // The enable failure may be thrown or reported; either way the body must be out.
    }

    expect(physics.active).toBe(false);
    expect(physics.body.attached).toBe(false);
    expect(scene.world.bodies).not.toContain(physics.body);
  });

  it('refuses joints on its body, including a mouse joint', () => {
    const world = new PhysicsWorld();
    const physics = new Container().addComponent(new PhysicsBodyComponent(world, { colliders: [{ shape: new CircleShape(5) }] }));
    const other = world.add(new PhysicsBody({ colliders: [{ shape: new CircleShape(5) }] }));
    const message = /PhysicsBodyComponent-managed bodies do not support joints yet/;

    expect(() => world.addJoint(new DistanceJoint({ bodyA: physics.body, bodyB: other }))).toThrow(message);
    expect(() => world.addJoint(new MouseJoint({ body: physics.body, target: { x: 0, y: 0 } }))).toThrow(message);
  });
});
