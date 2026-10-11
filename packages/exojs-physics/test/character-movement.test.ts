import { BehaviorComponent, Container, type PointLike, Scene, SceneDirector, type Seconds, SystemOrder, Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CharacterMovementComponent,
  type CharacterMovementOptions,
  CircleShape,
  KinematicMovementComponent,
  type PhysicsBody,
  PhysicsBodyComponent,
  PhysicsWorld,
  PolygonShape,
} from '../src/index';
import { measureAllocationRate } from './allocationSampler';
import { createAppStub } from './sceneHarness';
import { colliderAt } from './support';

const STEP = Time.seconds(1 / 60);
const DT = 1 / 60;

/** Capsule half-height: spine half-length 12 plus radius 8. */
const HALF = 20;
/** Floor top used by most scenes. */
const FLOOR = 100;
const REST_Y = FLOOR - HALF;

class WorldScene extends Scene {
  public readonly world = new PhysicsWorld();

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });
  }
}

/** Feeds walking input to a character every fixed step, like gameplay code. */
class Controls extends BehaviorComponent {
  public input = 0;

  public constructor(private readonly character: CharacterMovementComponent) {
    super();
  }

  public override fixedUpdate(_step: Seconds): void {
    this.character.move(this.input);
  }
}

interface SpawnOptions extends CharacterMovementOptions {
  readonly position?: PointLike;
  readonly maxSpeed?: number;
}

const setup = async () => {
  const { app, errors } = createAppStub();
  const director = new SceneDirector(app, { world: WorldScene });

  await director.change(WorldScene);

  const scene = director.currentScene as WorldScene;
  const world = scene.world;

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

  const spawn = (options: SpawnOptions = {}) => {
    const node = new Container();
    const physics = node.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'kinematic',
        position: options.position ?? { x: 0, y: REST_Y - 0.05 },
        colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }],
      }),
    );
    const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: options.maxSpeed ?? 240 }));
    const character = node.addComponent(new CharacterMovementComponent(movement, { gravity: 1600, ...options }));
    const controls = node.addComponent(new Controls(character));

    scene.addChild(node);

    return { node, physics, movement, character, controls, body: physics.body };
  };

  const floor = (top = FLOOR, from = -2000, to = 2000) =>
    colliderAt(world, new BoxShape(to - from, 20), { x: (from + to) / 2, y: top + 10 });

  return { director, errors, scene, world, frame, spawn, floor };
};

const run = (frame: (steps?: number) => void, steps: number, each?: () => void): void => {
  for (let i = 0; i < steps; i++) {
    frame();
    each?.();
  }
};

describe('CharacterMovementComponent', () => {
  describe('composition', () => {
    it('takes over the movement while enabled and hands it back when disabled', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { movement, character } = spawn();

      expect(() => movement.move({ x: 1, y: 0 })).toThrow(/CharacterMovementComponent drives this movement/);

      character.enabled = false;
      movement.move({ x: 1, y: 0 });
      frame();
      expect(movement.body.x).toBeCloseTo(4, 9);
    });

    it('refuses a second character for one movement', async () => {
      const { errors, scene, spawn, floor } = await setup();

      floor();

      const { movement } = spawn();
      const other = new Container();

      other.addComponent(new CharacterMovementComponent(movement));
      scene.addChild(other);

      expect(errors.map(error => error.message)).toEqual([expect.stringMatching(/already driven/)]);
    });

    it('defaults gravity to the world gravity along -up', () => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 980 } });
      const physics = new Container().addComponent(
        new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(4) }] }),
      );
      const movement = new KinematicMovementComponent(physics, { maxSpeed: 10 });

      expect(new CharacterMovementComponent(movement).gravity).toBeCloseTo(980, 9);
      expect(new CharacterMovementComponent(movement, { up: { x: 0, y: 1 } }).gravity).toBe(0);
    });

    it('validates its options', () => {
      const world = new PhysicsWorld();
      const physics = new Container().addComponent(
        new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(4) }] }),
      );
      const movement = new KinematicMovementComponent(physics, { maxSpeed: 10 });

      expect(() => new CharacterMovementComponent(movement, { up: { x: 0, y: 0 } })).toThrow(RangeError);
      expect(() => new CharacterMovementComponent(movement, { maxSlopeAngle: Math.PI / 2 })).toThrow(RangeError);
      expect(() => new CharacterMovementComponent(movement, { gravity: -1 })).toThrow(RangeError);
      expect(() => new CharacterMovementComponent(movement, { maxStepHeight: Number.NaN })).toThrow(RangeError);
      expect(() => new CharacterMovementComponent(movement, { maxFallSpeed: 0 })).toThrow(RangeError);

      const character = new CharacterMovementComponent(movement);

      expect(() => character.move(Number.NaN)).toThrow(RangeError);
      expect(() => character.launch({ x: Infinity, y: 0 })).toThrow(RangeError);
    });
  });

  describe('ground and contacts', () => {
    it('stands still on flat ground without drifting', async () => {
      const { spawn, floor, frame } = await setup();
      const ground = floor();
      const { character, body } = spawn();

      frame();
      expect(character.grounded).toBe(true);

      const restY = body.y;

      run(frame, 240, () => {
        expect(character.grounded).toBe(true);
        expect(body.y).toBeCloseTo(restY, 9);
        expect(character.velocity.y).toBeCloseTo(0, 9);
      });

      expect(character.groundNormal.x).toBeCloseTo(0, 9);
      expect(character.groundNormal.y).toBeCloseTo(-1, 9);
      expect(character.groundBody).toBe(ground.body);
      expect(character.groundCollider).toBe(ground);
      expect(restY).toBeGreaterThan(REST_Y - 0.2);
      expect(restY).toBeLessThan(REST_Y);
    });

    it('falls under gravity and lands without bouncing', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { character, body } = spawn({ position: { x: 0, y: 0 } });

      frame();
      expect(character.grounded).toBe(false);
      expect(character.velocity.y).toBeCloseTo(1600 * DT, 6);

      let landedAt = -1;

      for (let i = 0; i < 120 && landedAt < 0; i++) {
        frame();

        if (character.grounded) {
          landedAt = i;
        }
      }

      expect(landedAt).toBeGreaterThan(0);
      expect(body.y).toBeLessThan(REST_Y);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);

      const landedY = body.y;

      run(frame, 30, () => {
        expect(character.grounded).toBe(true);
        expect(body.y).toBeCloseTo(landedY, 9);
      });
    });

    it('reports grounded for the step that just completed, not one step late', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { character, body } = spawn({ position: { x: 0, y: REST_Y - 3 } });
      const seen: boolean[] = [];

      run(frame, 6, () => {
        // A touching body is grounded in the same frame its position reaches the floor.
        seen.push(character.grounded);
        expect(character.grounded).toBe(body.y > REST_Y - 0.2);
      });

      expect(seen).toContain(false);
      expect(seen.at(-1)).toBe(true);
    });

    it('walks at maxSpeed along flat ground', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { character, controls, body } = spawn();

      frame();
      controls.input = 1;

      const y = body.y;

      run(frame, 60, () => {
        expect(character.velocity.x).toBeCloseTo(240, 6);
        expect(body.y).toBeCloseTo(y, 9);
        expect(character.grounded).toBe(true);
      });

      expect(body.x).toBeCloseTo(240, 4);

      controls.input = -0.5;
      frame();
      expect(character.velocity.x).toBeCloseTo(-120, 6);

      controls.input = 0;
      frame();
      expect(character.velocity.x).toBe(0);
    });

    it('walks off an edge and falls', async () => {
      const { spawn, floor, frame } = await setup();

      floor(FLOOR, -500, 20);

      const { character, controls, body } = spawn();

      frame();
      controls.input = 1;
      run(frame, 30);

      expect(character.grounded).toBe(false);
      expect(body.y).toBeGreaterThan(REST_Y + 1);
      expect(character.velocity.x).toBeCloseTo(240, 6);
    });

    it('keeps standing against a wall and reports it', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();

      const wall = colliderAt(world, new BoxShape(20, 200), { x: 60, y: 0 });
      const { character, controls, body } = spawn();

      frame();
      controls.input = 1;
      run(frame, 30);

      expect(body.x).toBeLessThan(42);
      expect(body.x).toBeGreaterThan(41.8);
      expect(character.grounded).toBe(true);
      expect(character.onWall).toBe(true);
      expect(character.wallNormal.x).toBeCloseTo(-1, 9);
      expect(character.groundBody).not.toBe(wall.body);
    });

    it('stops a launch at a ceiling and falls back', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(400, 20), { x: 0, y: FLOOR - 2 * HALF - 30 - 10 });

      const { character, body } = spawn();

      frame();
      character.launch({ x: 0, y: -600 });

      let hit = false;

      run(frame, 10, () => {
        hit ||= character.onCeiling;
      });

      expect(hit).toBe(true);
      expect(body.y).toBeGreaterThan(REST_Y - 30);
      run(frame, 60);
      expect(character.grounded).toBe(true);
    });

    it('stands on whatever side up points away from', async () => {
      const { world, spawn, frame } = await setup();
      const wall = colliderAt(world, new BoxShape(20, 400), { x: -10, y: 0 });
      const { character, body } = spawn({ position: { x: 40, y: 0 }, up: { x: 1, y: 0 } });

      body.setTransform({ x: 8.05, y: 0 }, 0);
      run(frame, 60);

      expect(character.grounded).toBe(true);
      expect(character.groundBody).toBe(wall.body);
      expect(character.groundNormal.x).toBeCloseTo(1, 9);
      expect(body.x).toBeLessThan(8.2);
      expect(body.x).toBeGreaterThan(8);
    });

    it('does not stand on sensors', async () => {
      const { world, spawn, frame } = await setup();

      colliderAt(world, new BoxShape(400, 20), { x: 0, y: FLOOR + 10 }, 0, 'static', { isSensor: true });

      const { character, body } = spawn();

      run(frame, 30);

      expect(character.grounded).toBe(false);
      expect(body.y).toBeGreaterThan(REST_Y + 10);
    });

    it('falls once its support is removed', async () => {
      const { world, spawn, frame } = await setup();
      const platform = colliderAt(world, new BoxShape(200, 20), { x: 0, y: FLOOR + 10 }, 0, 'kinematic');
      const { character, body } = spawn();

      run(frame, 5);
      expect(character.groundBody).toBe(platform.body);

      world.remove(platform.body);
      expect(character.grounded).toBe(false);
      expect(character.groundBody).toBeNull();

      run(frame, 20);
      expect(body.y).toBeGreaterThan(REST_Y + 10);
    });
  });

  describe('launching', () => {
    it('launches above maxSpeed and keeps walking speed sideways', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { character, controls, body } = spawn({ maxSpeed: 100 });

      frame();
      controls.input = 1;
      character.launch({ x: 0, y: -520 });
      frame();

      expect(character.grounded).toBe(false);
      expect(character.velocity.y).toBeCloseTo(-520 + 1600 * DT, 6);
      expect(character.velocity.x).toBeCloseTo(100, 6);

      let apex = body.y;

      run(frame, 120, () => {
        apex = Math.min(apex, body.y);
      });

      // Semi-implicit Euler peaks at v^2 / 2g minus one step's gravity share.
      expect(REST_Y - apex).toBeGreaterThan(80);
      expect(REST_Y - apex).toBeLessThan((520 * 520) / (2 * 1600) + 0.5);
      expect(character.grounded).toBe(true);
    });

    it('launches once per advance, even across several fixed steps', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { character } = spawn();

      frame();
      character.launch({ x: 0, y: -300 });
      frame(3);

      expect(character.velocity.y).toBeCloseTo(-300 + 3 * 1600 * DT, 6);
    });

    it('launches in mid-air as well', async () => {
      const { spawn, frame } = await setup();
      const { character } = spawn({ position: { x: 0, y: 0 } });

      run(frame, 10);
      expect(character.velocity.y).toBeGreaterThan(0);

      character.launch({ x: 0, y: -400 });
      frame();
      expect(character.velocity.y).toBeCloseTo(-400 + 1600 * DT, 6);
    });

    it('caps the fall speed', async () => {
      const { spawn, frame } = await setup();
      const { character } = spawn({ position: { x: 0, y: 0 }, maxFallSpeed: 300 });

      run(frame, 60);
      expect(character.velocity.y).toBeCloseTo(300, 6);
    });
  });

  describe('surfaces', () => {
    /** Flat ground to x = 0, then a ramp rising at `angle` for 400 units, then flat again. */
    const ramp = (world: PhysicsWorld, angle: number) => {
      const rise = Math.tan(angle) * 400;

      return colliderAt(
        world,
        new ChainShape([
          { x: -1000, y: FLOOR },
          { x: 0, y: FLOOR },
          { x: 400, y: FLOOR - rise },
          { x: 1400, y: FLOOR - rise },
        ]),
        { x: 0, y: 0 },
      );
    };

    it('walks up and down a walkable slope without leaving it', async () => {
      const { world, spawn, frame } = await setup();
      const angle = (30 * Math.PI) / 180;

      ramp(world, angle);

      const { character, controls, body } = spawn({ position: { x: -100, y: REST_Y - 0.05 } });

      frame();
      controls.input = 1;
      run(frame, 150, () => expect(character.grounded).toBe(true));

      // At the top of the ramp, 400 * tan(30°) ≈ 230.9 above the floor.
      expect(body.x).toBeGreaterThan(400);
      expect(body.y).toBeLessThan(REST_Y - 230);

      controls.input = -1;
      run(frame, 150, () => expect(character.grounded).toBe(true));
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });

    it('does not walk up or stand on a slope steeper than maxSlopeAngle', async () => {
      const { world, spawn, frame } = await setup();

      ramp(world, (60 * Math.PI) / 180);

      const { character, controls, body } = spawn({ position: { x: -100, y: REST_Y - 0.05 } });

      frame();
      controls.input = 1;
      run(frame, 90);

      expect(body.y).toBeGreaterThan(REST_Y - 6);
      expect(body.x).toBeLessThan(5);
      expect(character.grounded).toBe(true);
      expect(character.onWall).toBe(true);

      // Placed on the steep face, it slides down instead of standing.
      controls.input = 0;
      body.setTransform({ x: 100, y: FLOOR - Math.tan((60 * Math.PI) / 180) * 100 - 30 }, 0);
      frame();
      expect(character.grounded).toBe(false);
      run(frame, 120);
      expect(body.x).toBeLessThan(10);
    });

    it('steps onto obstacles up to maxStepHeight and not higher', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(200, 6), { x: 150, y: FLOOR - 3 });
      colliderAt(world, new BoxShape(200, 12), { x: -150, y: FLOOR - 6 });

      const { character, controls, body } = spawn({ maxStepHeight: 8 });

      frame();
      controls.input = 1;
      run(frame, 30);

      expect(body.x).toBeGreaterThan(80);
      expect(body.y).toBeCloseTo(REST_Y - 6, 0);
      expect(character.grounded).toBe(true);

      controls.input = -1;
      run(frame, 60);

      // Stopped by the 12-unit box's right face at x = -50, one radius away.
      expect(body.x).toBeGreaterThan(-42.2);
      expect(body.x).toBeLessThan(-41.8);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
      expect(character.onWall).toBe(true);
    });

    it('does not ride its rounded underside over a step just above maxStepHeight', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(200, 10), { x: 150, y: FLOOR - 5 });

      const { controls, body } = spawn({ maxStepHeight: 8 });

      frame();
      controls.input = 1;
      run(frame, 60);

      expect(body.x).toBeLessThan(42.01);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });

    it('does not step without maxStepHeight', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(200, 6), { x: 150, y: FLOOR - 3 });

      const { controls, body } = spawn();

      frame();
      controls.input = 1;
      run(frame, 30);

      expect(body.x).toBeLessThan(50);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });

    it('does not step up into a ceiling', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(200, 6), { x: 150, y: FLOOR - 3 });
      // Leaves 2 units of headroom above a standing character: less than the step.
      colliderAt(world, new BoxShape(600, 20), { x: 150, y: FLOOR - 2 * HALF - 2 - 10 });

      const { controls, body } = spawn({ maxStepHeight: 8 });

      frame();
      controls.input = 1;
      run(frame, 30);

      expect(body.x).toBeLessThan(50);
      expect(body.y).toBeGreaterThan(REST_Y - 2.2);
    });

    it('follows the ground down stairs and ramps instead of flying off', async () => {
      const { world, spawn, frame } = await setup();
      const angle = (40 * Math.PI) / 180;

      ramp(world, angle);

      const { character, controls, body } = spawn({ position: { x: 600, y: REST_Y - Math.tan(angle) * 400 - 0.05 } });

      frame();
      controls.input = -1;
      run(frame, 240, () => expect(character.grounded).toBe(true));
      expect(body.x).toBeLessThan(0);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });

    it('does not snap back to the ground while launching', async () => {
      const { world, spawn, frame } = await setup();

      ramp(world, (30 * Math.PI) / 180);

      const { character, controls } = spawn({ position: { x: 600, y: REST_Y - Math.tan((30 * Math.PI) / 180) * 400 - 0.05 } });

      frame();
      controls.input = -1;
      run(frame, 5);
      character.launch({ x: 0, y: -60 });
      frame();
      expect(character.grounded).toBe(false);
      expect(character.velocity.y).toBeLessThan(0);
    });

    it('crosses adjacent tiles and chain seams without snagging', async () => {
      const { world, spawn, frame } = await setup();

      for (let i = -10; i < 60; i++) {
        colliderAt(world, new BoxShape(16, 16), { x: i * 16 + 8, y: FLOOR + 8 });
      }

      const seam: PointLike[] = [];

      for (let x = 960; x <= 2000; x += 16) {
        seam.push({ x, y: FLOOR });
      }

      colliderAt(world, new ChainShape(seam), { x: 0, y: 0 });

      const { character, controls, body } = spawn();

      frame();
      controls.input = 1;

      const y = body.y;

      run(frame, 300, () => {
        expect(character.grounded).toBe(true);
        expect(character.velocity.x).toBeCloseTo(240, 6);
        expect(body.y).toBeCloseTo(y, 6);
      });

      expect(body.x).toBeGreaterThan(1150);
    });

    it('lands in a corner between floor and wall', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();
      colliderAt(world, new BoxShape(20, 400), { x: 30, y: 0 });

      const { character, controls, body } = spawn({ position: { x: 0, y: 0 } });

      controls.input = 1;
      run(frame, 60);

      expect(character.grounded).toBe(true);
      expect(body.x).toBeLessThan(12);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });

    it('lands on a one-way platform from above and jumps through it from below', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();

      const top = FLOOR - 60;
      const platform = colliderAt(
        world,
        new ChainShape([
          { x: -100, y: top },
          { x: 100, y: top },
        ]),
        { x: 0, y: 0 },
        0,
        'static',
        { filter: { category: 0x0002 } },
      );
      const { character, body } = spawn();

      frame();
      character.launch({ x: 0, y: -600 });
      run(frame, 120);

      expect(character.groundCollider).toBe(platform);
      expect(body.y).toBeCloseTo(top - HALF, 0);

      // Dropping through is a game rule: leave the platform's category out of the mask.
      const collider = body.colliders[0]!;

      collider.filter.mask &= ~0x0002;
      run(frame, 20);
      expect(body.y).toBeGreaterThan(top);
      collider.filter.mask |= 0x0002;
      run(frame, 60);
      expect(character.groundCollider).not.toBe(platform);
      expect(body.y).toBeGreaterThan(REST_Y - 0.2);
    });
  });

  describe('moving platforms', () => {
    /** A kinematic platform whose velocity a behaviour sets every fixed step, before the world steps. */
    class Drive extends BehaviorComponent {
      public vx = 0;
      public vy = 0;

      public constructor(private readonly body: PhysicsBody) {
        super();
      }

      public override fixedUpdate(): void {
        this.body.linearVelocityX = this.vx;
        this.body.linearVelocityY = this.vy;
      }
    }

    const platformSetup = async () => {
      const harness = await setup();
      const node = new Container();
      const physics = node.addComponent(
        new PhysicsBodyComponent(harness.world, {
          type: 'kinematic',
          position: { x: 0, y: FLOOR + 10 },
          colliders: [{ shape: new BoxShape(200, 20) }],
        }),
      );
      const drive = node.addComponent(new Drive(physics.body));

      harness.scene.addChild(node);

      return { ...harness, platform: physics.body, platformNode: node, drive };
    };

    it('carries a character horizontally, through reversals', async () => {
      const { spawn, frame, platform, drive } = await platformSetup();
      const { character, body } = spawn();

      frame();
      drive.vx = 90;
      run(frame, 60, () => {
        expect(character.grounded).toBe(true);
        expect(body.x - platform.x).toBeCloseTo(0, 6);
      });

      drive.vx = -90;
      run(frame, 30, () => expect(body.x - platform.x).toBeCloseTo(0, 6));
      expect(platform.x).toBeCloseTo(45, 4);
      expect(character.velocity.x).toBeCloseTo(-90, 6);
    });

    it('carries a character up and down without sinking in or floating off', async () => {
      const { spawn, frame, platform, drive } = await platformSetup();
      const { character, body } = spawn();

      frame();

      const gap = platform.y - body.y;

      for (const vy of [-120, 120, -60, 200]) {
        drive.vy = vy;
        run(frame, 30, () => {
          expect(character.grounded).toBe(true);
          expect(platform.y - body.y).toBeCloseTo(gap, 4);
        });
      }
    });

    it('keeps the platform velocity when jumping off it', async () => {
      const { spawn, frame, drive } = await platformSetup();
      const { character } = spawn();

      frame();
      drive.vx = 120;
      run(frame, 5);
      character.launch({ x: 0, y: -400 });
      frame();

      expect(character.grounded).toBe(false);
      expect(character.velocity.x).toBeCloseTo(120, 6);
    });

    it('stops at a wall while the platform carries on', async () => {
      const { world, spawn, frame, platform, drive } = await platformSetup();

      colliderAt(world, new BoxShape(20, 60), { x: 40, y: FLOOR - 40 });

      const { character, body } = spawn();

      frame();
      drive.vx = 120;
      run(frame, 20);

      expect(body.x).toBeLessThan(22);
      expect(platform.x).toBeGreaterThan(35);
      expect(character.grounded).toBe(true);
    });

    it('picks up the velocity of a platform moved by its own movement, whatever the order', async () => {
      const harness = await setup();
      const { spawn, frame, world, scene } = harness;
      const { character, body } = spawn();
      // Attached after the character, so its controller is registered second.
      const node = new Container();
      const physics = node.addComponent(
        new PhysicsBodyComponent(world, {
          type: 'kinematic',
          position: { x: 0, y: FLOOR + 10 },
          colliders: [{ shape: new BoxShape(200, 20) }],
        }),
      );
      const platformMovement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 60 }));

      class Push extends BehaviorComponent {
        public override fixedUpdate(): void {
          platformMovement.move({ x: 1, y: 0 });
        }
      }

      node.addComponent(new Push());
      scene.addChild(node);

      frame();
      run(frame, 60, () => expect(body.x - physics.body.x).toBeCloseTo(0, 6));
      expect(character.grounded).toBe(true);
    });

    it('falls once a carrying platform is destroyed', async () => {
      const { spawn, frame, platformNode, drive } = await platformSetup();
      const { character, body } = spawn();

      frame();
      drive.vx = 60;
      run(frame, 5);
      platformNode.destroy();
      run(frame, 20);

      expect(character.grounded).toBe(false);
      expect(body.y).toBeGreaterThan(REST_Y + 5);
    });
  });

  describe('runtime', () => {
    it('integrates every fixed step of a multi-step advance', async () => {
      const a = await setup();
      const b = await setup();
      const fallA = a.spawn({ position: { x: 0, y: 0 } });
      const fallB = b.spawn({ position: { x: 0, y: 0 } });

      a.floor();
      b.floor();
      fallA.controls.input = 1;
      fallB.controls.input = 1;

      for (let i = 0; i < 20; i++) {
        a.frame(3);
        b.frame();
        b.frame();
        b.frame();
      }

      expect(fallA.body.x).toBeCloseTo(fallB.body.x, 9);
      expect(fallA.body.y).toBeCloseTo(fallB.body.y, 9);
    });

    it('steps with a manually driven world', () => {
      const world = new PhysicsWorld();

      colliderAt(world, new BoxShape(400, 20), { x: 0, y: FLOOR + 10 });

      const physics = new Container().addComponent(
        new PhysicsBodyComponent(world, {
          type: 'kinematic',
          position: { x: 0, y: 0 },
          colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }],
        }),
      );
      const movement = new KinematicMovementComponent(physics, { maxSpeed: 60 });
      const character = new CharacterMovementComponent(movement, { gravity: 1600 });

      world.add(physics.body);
      movement._driver = character;
      world._addStepController(movement);

      character.move(1);
      world.step(3 / 60 + 1e-9);

      // Gravity integrates three times: v = 3g·dt, y = g·dt²·(1 + 2 + 3).
      expect(physics.body.y).toBeCloseTo(1600 * DT * DT * 6, 6);
      expect(physics.body.x).toBeCloseTo(3, 6);
      expect(character.velocity.y).toBeCloseTo(1600 * DT * 3, 6);

      world.step(1 / 60);
      expect(physics.body.x).toBeCloseTo(3, 6);
    });

    it('moves through the simulation so interpolation sees continuous motion', async () => {
      const { spawn, floor, frame } = await setup();

      floor();

      const { controls, body, node } = spawn();

      frame();
      controls.input = 1;
      run(frame, 10, () => {
        expect(body.x - body.previousX).toBeCloseTo(4, 9);
        expect(node.x).toBeCloseTo(body.x, 9);
      });
    });

    it('leaves no velocity behind when disabled and starts at rest when enabled again', async () => {
      const { spawn, frame } = await setup();
      const { character, body } = spawn({ position: { x: 0, y: 0 } });

      run(frame, 20);
      expect(character.velocity.y).toBeGreaterThan(300);

      character.enabled = false;
      expect(body.linearVelocityY).toBe(0);
      expect(character.velocity.y).toBe(0);

      const y = body.y;

      run(frame, 5);
      expect(body.y).toBe(y);

      character.enabled = true;
      frame();
      expect(character.velocity.y).toBeCloseTo(1600 * DT, 6);
    });

    it('stops with the scene when its node leaves it and resumes from rest', async () => {
      const { scene, spawn, frame } = await setup();
      const { character, node, body } = spawn({ position: { x: 0, y: 0 } });

      run(frame, 20);
      scene.removeChild(node);
      expect(body.linearVelocityY).toBe(0);

      run(frame, 5);
      scene.addChild(node);
      frame();
      expect(character.velocity.y).toBeCloseTo(1600 * DT, 6);
    });

    it('keeps its state across a reparent within the scene', async () => {
      const { scene, spawn, frame } = await setup();
      const { character, node } = spawn({ position: { x: 0, y: 0 } });
      const holder = new Container();

      scene.addChild(holder);
      run(frame, 10);

      const before = character.velocity.y;

      holder.addChild(node);
      frame();
      expect(character.velocity.y).toBeCloseTo(before + 1600 * DT, 6);
    });

    it('survives destruction during a step and its world being destroyed', async () => {
      const { world, spawn, floor, frame } = await setup();

      floor();

      const { node } = spawn();

      frame();
      node.destroy();
      frame();

      const other = spawn();

      frame();
      world.destroy();
      expect(other.character.grounded).toBe(false);
    });

    it('stays within the allocation rate of the movement it drives', async () => {
      const course = (driven: boolean) => {
        const world = new PhysicsWorld();

        colliderAt(world, new BoxShape(4000, 20), { x: 0, y: FLOOR + 10 });
        colliderAt(
          world,
          new PolygonShape([
            { x: 0, y: 0 },
            { x: 60, y: -30 },
            { x: 60, y: 0 },
          ]),
          { x: 100, y: FLOOR },
        );
        colliderAt(world, new BoxShape(40, 6), { x: 220, y: FLOOR - 3 });

        const physics = new Container().addComponent(
          new PhysicsBodyComponent(world, {
            type: 'kinematic',
            position: { x: 0, y: REST_Y - 0.05 },
            colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }],
          }),
        );
        const movement = new KinematicMovementComponent(physics, { maxSpeed: 240 });
        const character = new CharacterMovementComponent(movement, { gravity: 1600, maxStepHeight: 8 });

        world.add(physics.body);
        world._addStepController(movement);

        if (driven) {
          movement._driver = character;
        }

        let tick = 0;

        // Back and forth over the slope and the step, launching now and then.
        return (): void => {
          const direction = Math.floor(tick / 90) % 2 === 0 ? 1 : -1;

          if (driven) {
            character.move(direction);

            if (tick % 45 === 0) {
              character.launch({ x: 0, y: -300 });
            }
          } else {
            movement.move({ x: direction, y: 0 });
          }

          tick++;
          world.step(DT);
        };
      };

      if (CharacterMovementComponent.prototype._driveStep.toString().includes('cov_')) {
        console.log('allocation comparison skipped under coverage (instrumentation inflates the measurement)');

        return;
      }

      const characterRate = await measureAllocationRate(course(true), { warmup: 60, iterations: 2000 });
      const movementRate = await measureAllocationRate(course(false), { warmup: 60, iterations: 2000 });

      // Neither builds objects per step; what the sampler sees is the world's own
      // step plus V8 boxing doubles passed to casts it declines to inline, and a
      // character casts a few times more per step than a bare movement (measured
      // about 1.7x). An object per cast or per contact would add far more.
      expect(characterRate.bytesPerIteration).toBeLessThan(movementRate.bytesPerIteration * 2.5);
    });
  });
});
