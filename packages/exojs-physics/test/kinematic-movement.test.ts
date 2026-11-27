import { BehaviorComponent, Container, type PointLike, Scene, SceneDirector, type Seconds, SystemOrder, Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, KinematicMovementComponent, PhysicsBodyComponent, PhysicsWorld } from '../src/index';
import { createAppStub } from './sceneHarness';
import { colliderAt } from './support';

const STEP = Time.seconds(1 / 60);

class WorldScene extends Scene {
  public readonly world = new PhysicsWorld();

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
  }
}

class OtherScene extends Scene {}

/** Issues one direction to a movement on every fixed step, like gameplay input would. */
class Steer extends BehaviorComponent {
  public direction: PointLike | null = { x: 1, y: 0 };

  public constructor(private readonly movement: KinematicMovementComponent) {
    super();
  }

  public override fixedUpdate(_step: Seconds): void {
    if (this.direction !== null) {
      this.movement.move(this.direction);
    }
  }
}

const setup = async (position: PointLike = { x: 0, y: 0 }, maxSpeed = 120) => {
  const { app, errors } = createAppStub();
  const director = new SceneDirector(app, { world: WorldScene, other: OtherScene });

  await director.change(WorldScene);

  const scene = director.currentScene as WorldScene;
  const node = new Container();
  const physics = node.addComponent(
    new PhysicsBodyComponent(scene.world, { type: 'kinematic', position, colliders: [{ shape: new CircleShape(10) }] }),
  );
  const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed }));

  scene.addChild(node);

  const frame = (fixedSteps = 1): void => {
    director._beginFrame();

    try {
      for (let i = 0; i < fixedSteps; i++) {
        director.fixedUpdate(STEP);
      }

      director.update(STEP);
    } finally {
      director._endFrame();
    }
  };

  return { director, errors, scene, world: scene.world, node, physics, movement, body: physics.body, frame };
};

describe('KinematicMovementComponent', () => {
  it.each(['collision', 'sensor'] as const)('consumes a move from a %s callback in the next hosted step', async kind => {
    const { world, movement, body, frame } = await setup();

    colliderAt(world, new BoxShape(10, 10), { x: 1000, y: 0 }, 0, 'static', { isSensor: kind === 'sensor' });
    colliderAt(world, new BoxShape(10, 10), { x: 1008, y: 0 }, 0, 'kinematic');

    let calls = 0;

    const callback = (): void => {
      calls++;
      movement.move({ x: 0, y: 1 });
    };

    if (kind === 'sensor') {
      world.onSensorEnter.add(callback);
    } else {
      world.onCollisionStart.add(callback);
    }

    frame();
    expect(calls).toBe(1);
    expect(body.y).toBe(0);
    frame();
    expect(body.y).toBeCloseTo(2, 9);
    frame();
    expect(body.y).toBeCloseTo(2, 9);
  });

  it.each([
    ['collision', 1],
    ['collision', 3],
    ['sensor', 1],
    ['sensor', 3],
  ] as const)('consumes a %s callback move from fixed step %i of a manual advance', (kind, triggerStep) => {
    const world = new PhysicsWorld();
    const physics = new Container().addComponent(
      new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(10) }] }),
    );
    const movement = new KinematicMovementComponent(physics, { maxSpeed: 60 });

    world.add(physics.body);
    world._addStepController(movement);
    colliderAt(world, new BoxShape(10, 10), { x: 1000, y: 0 }, 0, 'static', { isSensor: kind === 'sensor' });

    const trigger = colliderAt(world, new BoxShape(10, 10), { x: triggerStep === 1 ? 1008 : 1013, y: 0 }, 0, 'kinematic');

    trigger.body.linearVelocityX = -120;

    let calls = 0;

    const callback = (): void => {
      calls++;
      movement.move({ x: 0, y: 1 });
    };

    if (kind === 'sensor') {
      world.onSensorEnter.add(callback);
    } else {
      world.onCollisionStart.add(callback);
    }

    world.step(3 / 60 + 1e-9);
    expect(calls).toBe(1);
    expect(physics.body.y).toBeCloseTo(triggerStep === 1 ? 2 : 0, 9);
    world.step(3 / 60);
    expect(physics.body.y).toBeCloseTo(triggerStep === 1 ? 2 : 3, 9);
    world.step(1 / 60);
    expect(physics.body.y).toBeCloseTo(triggerStep === 1 ? 2 : 3, 9);
  });

  it('moves at maxSpeed through the simulation, not by teleporting', async () => {
    const { node, movement, body, frame } = await setup();
    const steer = node.addComponent(new Steer(movement));

    frame();

    for (let i = 0; i < 60; i++) {
      const before = body.x;

      frame();
      expect(body.previousX).toBeCloseTo(before, 9);
      expect(body.x - before).toBeCloseTo(2, 9);
      expect(body.linearVelocityX).toBeCloseTo(120, 9);
    }

    expect(body.x).toBeCloseTo(122, 6);
    expect(node.x).toBeCloseTo(body.x, 9);
    expect(movement.blocked).toBe(false);

    steer.direction = { x: 0.5, y: 0 };
    frame();
    expect(body.linearVelocityX).toBeCloseTo(60, 9);

    steer.direction = { x: 30, y: 40 };
    frame();
    expect(body.linearVelocityX).toBeCloseTo(72, 9);
    expect(body.linearVelocityY).toBeCloseTo(96, 9);
  });

  it('applies a command issued in the same fixed step, whatever the attachment order', async () => {
    const { node, movement, body, frame } = await setup();

    // The steering behaviour is attached after the movement, and the movement
    // runs no hook of its own: the world resolves the command when it steps.
    node.addComponent(new Steer(movement));
    frame();

    expect(body.x).toBeCloseTo(2, 9);
  });

  it('lasts one world step and leaves no velocity behind', async () => {
    const { movement, body, frame } = await setup();

    movement.move({ x: 1, y: 0 });
    frame(3);

    expect(body.x).toBeCloseTo(2, 9);
    expect(body.linearVelocityX).toBe(0);

    frame();
    expect(body.x).toBeCloseTo(2, 9);
  });

  it('carries one command through every fixed step of a manual world.step call', async () => {
    const world = new PhysicsWorld();
    const physics = new Container().addComponent(
      new PhysicsBodyComponent(world, { type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(10) }] }),
    );
    const movement = new KinematicMovementComponent(physics, { maxSpeed: 60 });

    world.add(physics.body);
    world._addStepController(movement);
    movement.move({ x: 1, y: 0 });
    world.step(3 / 60 + 1e-9);

    expect(physics.body.x).toBeCloseTo(3, 9);

    world.step(1 / 60);
    expect(physics.body.x).toBeCloseTo(3, 9);
  });

  it('caps a command at its distance across a multi-step world.step call', () => {
    const world = new PhysicsWorld();
    const physics = new Container().addComponent(
      new PhysicsBodyComponent(world, { type: 'kinematic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(10) }] }),
    );
    const movement = new KinematicMovementComponent(physics, { maxSpeed: 60 });

    world.add(physics.body);
    world._addStepController(movement);
    movement.move({ x: 1, y: 0 }, 2.5);
    world.step(5 / 60 + 1e-9);

    expect(physics.body.x).toBeCloseTo(2.5, 9);
    expect(physics.body.linearVelocityX).toBe(0);
    expect(() => movement.move({ x: 1, y: 0 }, -1)).toThrow(RangeError);
    expect(() => movement.move({ x: 1, y: 0 }, Number.NaN)).toThrow(RangeError);
  });

  it('stops at a wall without entering it and reports the contact', async () => {
    const { world, node, movement, body, frame } = await setup();

    colliderAt(world, new BoxShape(20, 400), { x: 110, y: 0 });
    node.addComponent(new Steer(movement));

    for (let i = 0; i < 120; i++) {
      frame();
      expect(body.x).toBeLessThanOrEqual(90);
    }

    expect(body.x).toBeGreaterThan(89.9);
    expect(movement.blocked).toBe(true);
    expect(movement.contactNormal.x).toBeCloseTo(-1, 9);
    expect(movement.contactNormal.y).toBeCloseTo(0, 9);
    expect(body.linearVelocityX).toBeCloseTo(0, 6);
  });

  it('does not pass through a wall it starts flush against', async () => {
    const { app, errors } = createAppStub();
    const director = new SceneDirector(app, { world: WorldScene, other: OtherScene });

    await director.change(WorldScene);

    const scene = director.currentScene as WorldScene;
    const node = new Container();
    const physics = node.addComponent(
      new PhysicsBodyComponent(scene.world, { type: 'kinematic', position: { x: 90, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }),
    );
    const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 2400 }));

    colliderAt(scene.world, new BoxShape(4, 400), { x: 102, y: 0 });
    scene.addChild(node);
    node.addComponent(new Steer(movement));

    for (let i = 0; i < 10; i++) {
      director._beginFrame();
      director.fixedUpdate(STEP);
      director._endFrame();
      expect(physics.body.x).toBeLessThanOrEqual(90);
    }

    expect(movement.blocked).toBe(true);
    expect(errors).toEqual([]);
  });

  it('slides along a wall it is pushed into at an angle', async () => {
    const { world, node, movement, body, frame } = await setup({ x: 89, y: 0 });

    colliderAt(world, new BoxShape(20, 4000), { x: 110, y: 0 });
    node.addComponent(new Steer(movement)).direction = { x: Math.SQRT1_2, y: Math.SQRT1_2 };

    for (let i = 0; i < 60; i++) {
      frame();
      expect(body.x).toBeLessThanOrEqual(90);
    }

    // The tangential share of the speed survives the contact.
    expect(body.y).toBeGreaterThan(120 * Math.SQRT1_2 * 0.95);
    expect(movement.blocked).toBe(true);
  });

  it('stops in a corner instead of creeping into either wall', async () => {
    const { world, node, movement, body, frame } = await setup({ x: 50, y: 50 });

    colliderAt(world, new BoxShape(20, 400), { x: 110, y: 0 });
    colliderAt(world, new BoxShape(400, 20), { x: 0, y: 110 });
    node.addComponent(new Steer(movement)).direction = { x: 1, y: 1 };

    for (let i = 0; i < 120; i++) {
      frame();
      expect(body.x).toBeLessThanOrEqual(90);
      expect(body.y).toBeLessThanOrEqual(90);
    }

    expect(body.x).toBeGreaterThan(89.5);
    expect(body.y).toBeGreaterThan(89.5);
  });

  it('cannot tunnel through thin geometry at any speed', async () => {
    const { world, node, movement, body, frame } = await setup({ x: 0, y: 0 }, 100_000);

    colliderAt(world, new BoxShape(0.5, 400), { x: 500, y: 0 });
    node.addComponent(new Steer(movement));

    for (let i = 0; i < 10; i++) {
      frame();
    }

    expect(body.x).toBeLessThanOrEqual(489.75);
    expect(body.x).toBeGreaterThan(489);
  });

  it('halts at once on stop()', async () => {
    const { node, movement, body, frame } = await setup();
    const steer = node.addComponent(new Steer(movement));

    frame();
    frame();
    steer.direction = null;
    movement.stop();

    expect(body.linearVelocityX).toBe(0);

    const x = body.x;

    frame();
    expect(body.x).toBe(x);
  });

  it('zeroes the velocity when disabled and resumes once enabled again', async () => {
    const { node, movement, body, frame } = await setup();

    node.addComponent(new Steer(movement));
    frame();
    frame();

    const x = body.x;

    movement.enabled = false;
    expect(body.linearVelocityX).toBe(0);
    frame();
    expect(body.x).toBe(x);

    movement.enabled = true;
    frame();
    expect(body.x).toBeCloseTo(x + 2, 9);
  });

  it('moves nothing while its physics component is disabled', async () => {
    const { node, physics, movement, body, frame } = await setup();

    node.addComponent(new Steer(movement));
    frame();
    frame();
    physics.enabled = false;
    frame();

    const x = body.x;

    physics.enabled = true;
    frame();
    expect(body.x).toBeCloseTo(x + 2, 9);
  });

  it('survives detach, reattach and destruction', async () => {
    const { scene, node, movement, body, frame } = await setup();

    node.addComponent(new Steer(movement));
    frame();
    frame();
    scene.removeChild(node);
    frame();
    scene.addChild(node);
    frame();
    frame();
    expect(body.x).toBeCloseTo(8, 9);

    node.destroy();
    expect(movement.destroyed).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(() => frame()).not.toThrow();
  });

  it('refuses a second movement for the same body', async () => {
    const { errors, scene, physics, movement } = await setup();
    const other = new Container();

    const second = other.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 1 }));

    scene.addChild(other);

    expect(errors.map(error => error.message)).toEqual([expect.stringMatching(/already moved/)]);
    expect(second.active).toBe(false);
    expect(movement.active).toBe(true);
    expect(physics.body._movement).toBe(movement);
  });

  it('requires a kinematic body and a valid speed', () => {
    const world = new PhysicsWorld();
    const dynamic = new PhysicsBodyComponent(world, { colliders: [{ shape: new CircleShape(1) }] });
    const kinematic = new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(1) }] });

    expect(() => new KinematicMovementComponent(dynamic, { maxSpeed: 1 })).toThrow(TypeError);
    expect(() => new KinematicMovementComponent(kinematic, { maxSpeed: -1 })).toThrow(RangeError);
    expect(() => new KinematicMovementComponent(kinematic, { maxSpeed: Number.NaN })).toThrow(RangeError);
    expect(() => new KinematicMovementComponent(kinematic, { maxSpeed: 1 }).move({ x: Number.NaN, y: 0 })).toThrow(RangeError);
  });

  it('leaves the motion of other bodies untouched', async () => {
    const { world, node, movement, frame } = await setup();
    const falling = colliderAt(world, new CircleShape(5), { x: -100, y: 0 }, 0, 'dynamic');
    const reference = new PhysicsWorld();
    const control = colliderAt(reference, new CircleShape(5), { x: -100, y: 0 }, 0, 'dynamic');

    falling.body.linearVelocityY = 50;
    control.body.linearVelocityY = 50;
    node.addComponent(new Steer(movement));

    for (let i = 0; i < 30; i++) {
      frame();
      reference.fixedUpdate(STEP);
    }

    expect(falling.body.y).toBe(control.body.y);
  });
});
