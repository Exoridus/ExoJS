import { Container, Scene, SceneDirector, SystemOrder } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsBody, PhysicsBodyComponent, PhysicsWorld } from '../src/index';
import { createAppStub } from './sceneHarness';

const DT = 1 / 60;

class WorldScene extends Scene {
  public readonly world = new PhysicsWorld();

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
  }
}

describe('PhysicsBodyComponent', () => {
  it('disabling after the body was removed from the world directly does not throw', async () => {
    const { app, errors } = createAppStub();
    const director = new SceneDirector(app, { world: WorldScene });

    await director.change(WorldScene);

    const scene = director.currentScene as WorldScene;
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(scene.world, { colliders: [{ shape: new BoxShape(10, 10) }] }));

    scene.addChild(node);
    scene.world.unbind(physics.body);
    scene.world.remove(physics.body);
    scene.world.step(DT);

    physics.enabled = false;

    expect(errors).toHaveLength(0);
  });
});

describe('NativePhysicsBackend.destroy', () => {
  it('releases the solver constraint pool', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 40 }, colliders: [{ shape: new BoxShape(400, 40) }] }));
    world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 5 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    for (let frame = 0; frame < 60; frame++) {
      world.step(DT);
    }

    const solver = (world as unknown as { _backend: { _solver: { _constraints: unknown[] } } })._backend._solver;

    expect(solver._constraints.length).toBeGreaterThan(0);

    world.destroy();

    expect(solver._constraints).toHaveLength(0);
  });
});

describe('PhysicsBody options', () => {
  it.each([
    [{ position: { x: Number.NaN, y: 0 } }],
    [{ position: { x: 0, y: Number.POSITIVE_INFINITY } }],
    [{ angle: Number.NaN }],
    [{ gravityScale: Number.NaN }],
    [{ linearDamping: -1 }],
    [{ angularDamping: Number.NaN }],
  ])('rejects %j', options => {
    expect(() => new PhysicsBody(options)).toThrow(RangeError);
  });

  it('accepts a zero gravity scale and zero damping', () => {
    expect(() => new PhysicsBody({ gravityScale: 0, linearDamping: 0, angularDamping: 0 })).not.toThrow();
  });
});
