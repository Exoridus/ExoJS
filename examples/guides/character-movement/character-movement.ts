import { type AxisAction, BehaviorComponent, type ButtonAction, Container, type Scene } from '@codexo/exojs';
import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CharacterMovementComponent,
  type Collider,
  KinematicMovementComponent,
  PhysicsBody,
  PhysicsBodyComponent,
  type PhysicsWorld,
} from '@codexo/exojs-physics';

declare const world: PhysicsWorld;
declare const scene: Scene;
declare const hero: Container;
declare const walk: AxisAction;
declare const jump: ButtonAction;
declare const drop: ButtonAction;

// #region guide:layers
// The body: where the character is and what it collides as.
const physics = hero.addComponent(
  new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }] }),
);

// The motor: collide-and-slide for a kinematic body. maxSpeed is the walking speed.
const movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 240 }));

// The character: surfaces, gravity and launches, executed through the motor.
const character = hero.addComponent(
  new CharacterMovementComponent(movement, {
    gravity: 1600,
    maxSlopeAngle: Math.PI / 4,
    maxStepHeight: 8,
    maxFallSpeed: 900,
  }),
);
// #endregion guide:layers

// #region guide:controls
class PlayerControls extends BehaviorComponent {
  // `jump.tick` hands each press to exactly one fixed step, however many steps
  // a frame runs - `jump.pressed` describes the frame instead.
  public override fixedUpdate(): void {
    character.move(walk.value);

    if (jump.tick.pressed && character.grounded) {
      character.launch({ x: 0, y: -520 });
    }
  }
}

hero.addComponent(new PlayerControls());
// #endregion guide:controls

// #region guide:double-jump
/** One extra jump in the air, refilled on landing: the game's rule, not the engine's. */
class DoubleJump extends BehaviorComponent {
  private airJumps = 1;

  public override fixedUpdate(): void {
    if (character.grounded) {
      this.airJumps = 1;
    }

    if (!jump.tick.pressed) {
      return;
    }

    if (character.grounded) {
      character.launch({ x: 0, y: -520 });
    } else if (this.airJumps > 0) {
      this.airJumps--;
      // launch replaces the airborne velocity, so a falling character rises again.
      character.launch({ x: 0, y: -440 });
    }
  }
}
// #endregion guide:double-jump

// #region guide:one-way
const ONE_WAY = 0x0002;

// Drawn left to right, the chain's normal points up: it blocks from above only.
world.add(
  new PhysicsBody({
    type: 'static',
    position: { x: 400, y: 300 },
    colliders: [
      {
        shape: new ChainShape([
          { x: -80, y: 0 },
          { x: 80, y: 0 },
        ]),
        filter: { category: ONE_WAY },
      },
    ],
  }),
);

/** Drops through a one-way platform: stop colliding with it until the character is below. */
class DropThrough extends BehaviorComponent {
  private platformBottom: number | null = null;

  public constructor(private readonly collider: Collider) {
    super();
  }

  public override update(): void {
    const platform = character.groundCollider;

    if (drop.pressed && platform?.filter.category === ONE_WAY) {
      this.collider.filter.mask &= ~ONE_WAY;
      this.platformBottom = platform.aabb.maxY;
    }
  }

  public override fixedUpdate(): void {
    if (this.platformBottom !== null && this.collider.aabb.minY > this.platformBottom) {
      this.collider.filter.mask |= ONE_WAY;
      this.platformBottom = null;
    }
  }
}

hero.addComponent(new DropThrough(physics.body.colliders[0]!));
// #endregion guide:one-way

// #region guide:moving-platform
/** Moves a kinematic platform by velocity, so whatever stands on it is carried. */
class Shuttle extends BehaviorComponent {
  private direction = 1;

  public constructor(private readonly body: PhysicsBody) {
    super();
  }

  public override fixedUpdate(): void {
    if (this.body.x > 600) {
      this.direction = -1;
    } else if (this.body.x < 200) {
      this.direction = 1;
    }

    this.body.linearVelocityX = this.direction * 100;
  }
}

const platform = new Container();
const platformPhysics = platform.addComponent(
  new PhysicsBodyComponent(world, { type: 'kinematic', position: { x: 400, y: 200 }, colliders: [{ shape: new BoxShape(120, 16) }] }),
);

platform.addComponent(new Shuttle(platformPhysics.body));
scene.addChild(platform);
// #endregion guide:moving-platform
