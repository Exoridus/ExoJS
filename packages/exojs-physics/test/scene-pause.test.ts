import { BehaviorComponent, Container, Scene, SceneDirector, type Seconds, SystemOrder, Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import {
  BoxShape,
  CapsuleShape,
  CharacterMovementComponent,
  CircleShape,
  KinematicMovementComponent,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '../src/index';
import { createAppStub } from './sceneHarness';
import { colliderAt } from './support';

/**
 * A scene pause requested while a fixed step runs - from a behaviour, a
 * scene system or a world callback - takes effect at the next step: the step
 * it was requested in finishes, world advance included, and no further step
 * runs until resume.
 */

const STEP = Time.seconds(1 / 60);
const FLOOR = 100;
const REST_Y = FLOOR - 20;

class WorldScene extends Scene {
  public readonly world = new PhysicsWorld({ gravity: { x: 0, y: 980 } });
  public readonly afterWorld: number[] = [];

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.systems.add(
      {
        fixedUpdate: () => {
          this.afterWorld.push(this.world._stepEpoch);
        },
      },
      { order: SystemOrder.Physics + 1 },
    );
  }
}

class Hook extends BehaviorComponent {
  public onFixedUpdate: () => void = () => {};

  public override fixedUpdate(_step: Seconds): void {
    this.onFixedUpdate();
  }
}

const setup = async () => {
  const { app } = createAppStub();
  const director = new SceneDirector(app, { world: WorldScene });

  await director.change(WorldScene);

  const scene = director.currentScene as WorldScene;
  const world = scene.world;

  colliderAt(world, new BoxShape(4000, 20), { x: 0, y: FLOOR + 10 });

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

  const hook = (): Hook => {
    const node = new Container();
    const component = node.addComponent(new Hook());

    scene.addChild(node);

    return component;
  };

  const character = (): CharacterMovementComponent => {
    const node = new Container();
    const physics = node.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'kinematic',
        position: { x: 0, y: REST_Y - 0.05 },
        colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }],
      }),
    );
    const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 240 }));
    const result = node.addComponent(new CharacterMovementComponent(movement, { gravity: 1600 }));

    scene.addChild(node);

    return result;
  };

  return { director, scene, world, frame, hook, character };
};

describe('scene pause inside a fixed step', () => {
  it('a pause from a collision callback finishes the step and holds the world until resume', async () => {
    const { director, scene, world, frame } = await setup();
    const ball = new Container();

    ball.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'dynamic',
        position: { x: 0, y: FLOOR - 60 },
        colliders: [{ shape: new CircleShape(10) }],
      }),
    );
    scene.addChild(ball);

    let pausedAt = -1;

    world.onCollisionStart.add(() => {
      if (pausedAt === -1) {
        pausedAt = world._stepEpoch;
        director.pause();
      }
    });

    for (let i = 0; i < 60 && pausedAt === -1; i++) {
      frame(3);
    }

    expect(pausedAt).not.toBe(-1);

    // The system after the world still ran in the step the callback paused,
    // and nothing stepped after it.
    const epochAtPause = world._stepEpoch;

    expect(scene.afterWorld.at(-1)).toBe(epochAtPause);

    frame(3);
    frame(3);

    expect(world._stepEpoch).toBe(epochAtPause);

    director.resume();
    frame(2);

    expect(world._stepEpoch).toBe(epochAtPause + 2);
  });

  it('a command issued after a behaviour paused the scene in the same step is applied by that step', async () => {
    const { director, world, frame, hook, character } = await setup();
    const pauser = hook();
    const jumper = hook();
    const player = character();

    frame();
    expect(player.grounded).toBe(true);

    pauser.onFixedUpdate = () => {
      pauser.onFixedUpdate = () => {};
      director.pause();
    };

    jumper.onFixedUpdate = () => {
      jumper.onFixedUpdate = () => {};
      player.launch({ x: 0, y: -400 });
    };

    const epoch = world._stepEpoch;

    frame(3);

    expect(world._stepEpoch).toBe(epoch + 1);
    expect(player.grounded).toBe(false);
    expect(player.velocity.y).toBeLessThan(0);

    const vy = player.velocity.y;

    director.resume();
    frame();

    // One launch, not a second one replayed on resume: gravity only slows it.
    expect(player.velocity.y).toBeGreaterThan(vy);
  });

  it('a command issued outside the fixed phase is still pending after a pause and runs on the first step after resume', async () => {
    // Characterization of the window a step-atomic pause does not close: a
    // command issued in the variable update belongs to no step, so the pause
    // that follows leaves it pending until resume.
    const { director, world, frame, character } = await setup();
    const player = character();

    frame();
    expect(player.grounded).toBe(true);

    player.launch({ x: 0, y: -400 });
    director.pause();

    frame(3);
    frame(3);

    expect(player.grounded).toBe(true);

    const epoch = world._stepEpoch;

    director.resume();
    frame();

    expect(world._stepEpoch).toBe(epoch + 1);
    expect(player.grounded).toBe(false);
    expect(player.velocity.y).toBeLessThan(0);
  });
});
