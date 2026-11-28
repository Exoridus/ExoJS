# @codexo/exojs/physics

A TypeScript 2D rigid-body runtime for ExoJS: bodies, colliders, joints, sensors, contact policy, spatial queries, and scene-node binding.

Use it for simulated motion and collision response. Core's geometric queries are sufficient for simpler hit tests and overlaps. This package contributes no application extension descriptor: construct a `PhysicsWorld` and give it a scene or another explicit owner.

The former `@codexo/exojs-physics` package name remains a 0.20 compatibility shim that forwards to this subpath. Prefer the subpath for new code.

## Install

```sh
npm install --save-exact @codexo/exojs
```

This module ships inside Core. Import its public classes from `@codexo/exojs/physics`; no second runtime package is required.

## Start a scene-owned world

```ts
import { Scene, SystemOrder } from '@codexo/exojs';
import { BoxShape, Collider, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';

export class GameScene extends Scene {
  override init(): void {
    const world = new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep, gravity: { x: 0, y: 980 } });

    this.systems.add(world, { order: SystemOrder.Physics });
    world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 400, y: 560 },
        colliders: [new Collider({ shape: new BoxShape(700, 32) })],
      }),
    );
    world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 400, y: 100 },
        colliders: [new Collider({ shape: new BoxShape(40, 40) })],
      }),
    );
  }
}
```

The scene registry drives and destroys this world: it steps once per application fixed step, after the scene's own `fixedUpdate` and its behaviours, so a command they issue is applied by that same step. A hosted world simulates its own `fixedDelta` per step, so it is built with `app.fixedTimeStep`; a world whose `fixedDelta` differs from the host step throws on its first step instead of running too fast or too slow. The snippet creates simulation only; bodies do not draw themselves. Use `world.attach(node, definition)` or `world.bind(body, node)` to connect visible nodes and add those nodes to the scene, which renders them with the rest of its root. The [Physics guide](https://exoridus.github.io/ExoJS/en/guide/physics/physics-basics/) supplies a complete, asset-free falling-box application.

## Bodies owned by nodes

`PhysicsBodyComponent` gives a node a body that follows the node's lifecycle: it joins the world while the node is active in a scene, leaves it with its state kept when the component is disabled, the node is removed from its scene, or its scene is retained, and is destroyed with the node.

```ts
import { Graphics } from '@codexo/exojs';
import { CircleShape, PhysicsBodyComponent } from '@codexo/exojs/physics';

const ball = new Graphics();
const physics = ball.addComponent(new PhysicsBodyComponent({ colliders: [{ shape: new CircleShape(12) }] }));

physics.body.applyImpulse(0, -300);
```

Register the scene's `PhysicsWorld` with its fixed-step phase before the node activates. An options-only component chooses the sole live registered world, or reports an activation error for zero or several. The explicit `new PhysicsBodyComponent(world, options)` overload also supports manually stepped or app-owned worlds. The body is available from construction. Read `activeWorld` for current membership. The `world` getter throws before the first successful automatic resolution.

An inferred body keeps its selected world across inactivity. Removing the world system disables its inferred components. Register the same world and re-enable them to resume, or replace the body component to select a different world. For a dependency that is absent or invalid on activation, fix the composition and disable/re-enable the dependent component to retry. A valid dependency can wait while disabled. Movement clears its pending commands and the velocity it controls when its body leaves simulation.

Component-managed bodies cannot participate in joints. Use manually managed bodies for jointed objects. `world.remove(body)` takes any body out of the simulation without destroying it; `world.add(body)` puts it back.

## Collision-aware movement

`KinematicMovementComponent` moves a kinematic body in a requested direction without passing through colliders: the motion stops at the first obstacle and slides along it. Issue a command every fixed step, from gameplay input or a navigation agent; a step without one leaves the body at rest.

```ts
import { BehaviorComponent, Container, Scene, SystemOrder } from '@codexo/exojs';
import { CircleShape, KinematicMovementComponent, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';

class Drift extends BehaviorComponent {
  public constructor(private readonly movement: KinematicMovementComponent) {
    super();
  }

  public override fixedUpdate(): void {
    this.movement.move({ x: 1, y: 0.25 });
  }
}

export class RoomScene extends Scene {
  override init(): void {
    const world = new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep });
    const hero = new Container();
    hero.addComponent(new PhysicsBodyComponent({ type: 'kinematic', colliders: [{ shape: new CircleShape(16) }] }));
    const movement = hero.addComponent(new KinematicMovementComponent({ maxSpeed: 240 }));

    this.systems.add(world, { order: SystemOrder.Physics });
    hero.addComponent(new Drift(movement));
    this.addChild(hero);
  }
}
```

Use `moveVelocity(velocity, distance?)` to issue a command in world units per second independent of `maxSpeed`. The same collision and distance constraints apply. Movement uses the same exact translation-only sweep as `world.shapeCast`, which returns the first collider, its distance and surface normal and reports an initial overlap separately.

## Character movement

`CharacterMovementComponent` composes over a `KinematicMovementComponent` for platformer-style movement: gravity, walking along the ground, walkable slopes, small steps, staying on the ground over dips, one-way platforms and moving platforms. The movement stays the only thing that moves the body; while the character is enabled it issues the movement's commands. When a jump is allowed is the game's decision, made from `grounded` and the other reported contact state.

```ts
import { ActionMap, AxisAction, BehaviorComponent, ButtonAction, Container, Keyboard, Scene, SystemOrder } from '@codexo/exojs';
import {
  CapsuleShape,
  CharacterMovementComponent,
  KinematicMovementComponent,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '@codexo/exojs/physics';

const controls = new ActionMap({
  walk: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
  jump: new ButtonAction(Keyboard.Space),
});

class Controls extends BehaviorComponent {
  public constructor(private readonly character: CharacterMovementComponent) {
    super();
  }

  public override fixedUpdate(): void {
    this.character.move(controls.walk.value);

    // `tick` hands each press to exactly one fixed step, however many steps a frame runs.
    if (controls.jump.tick.pressed && this.character.grounded) {
      this.character.launch({ x: 0, y: -520 });
    }
  }
}

export class LevelScene extends Scene {
  override init(): void {
    const world = new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep });
    const hero = new Container();
    hero.addComponent(new PhysicsBodyComponent({ type: 'kinematic', colliders: [{ shape: new CapsuleShape(0, -12, 0, 12, 8) }] }));
    hero.addComponent(new KinematicMovementComponent({ maxSpeed: 240 }));
    const character = hero.addComponent(new CharacterMovementComponent({ gravity: 1600, maxStepHeight: 8 }));

    this.systems.add(world, { order: SystemOrder.Physics });
    this.inputs.attach(controls);
    hero.addComponent(new Controls(character));
    this.addChild(hero);
  }
}
```

## Collider placement

`Collider.boxFromBounds(node)` snapshots local geometry and positive local scale into a box relative to the node's pivot. A circle needs an explicit radius and optional body-local offset. Supply several colliders to build compound geometry. If art, scale or origin changes later, update physics by replacing the affected collider explicitly.

Bindings compensate for translated and rotated parents, including retained groups. They require a rigid parent world transform and a node with zero skew and positive finite visual scale. If those conditions are violated at runtime, presentation pauses with a diagnostic until the transform is repaired. Keep physics-driven ancestors in the same world for parent-first synchronization.

## Important boundaries

Choose one stepping clock. A world registered in `scene.systems` is stepped by the host, once per fixed step, and needs `fixedDelta: app.fixedTimeStep`; do not also call `step()`, which development builds report. A world that is not registered can use `step(frameDeltaSeconds)` and its own accumulator, at any rate. A world registered in `app.systems` instead steps before every scene's fixed-step code and keeps stepping while the scene is paused: an advanced setup, not a substitute for the scene-owned world.

An interpolating hosted world reads its blend factor from the host: `new PhysicsWorld({ fixedDelta: app.fixedTimeStep, interpolation: true, frameAlphaSource: () => app.frameAlpha })`. A world stepped by hand defaults to its own accumulator.

Physics angles use radians and clockwise-positive screen rotation. Scene-node rotation uses degrees with the opposite screen sign; the built-in binding performs the conversion. Interpolation affects bound-node presentation, not the number of collision steps.

Continuous collision covers supported translational shape casts, not unrestricted rotational sweeping. Boundary-only geometry is not a solid dynamic mass. Fixed timesteps do not promise cross-build or cross-machine lockstep determinism, and performance depends on the actual contacts, shapes, and workload.

For tilemap collision, use [`@codexo/exojs/tilemap-physics`](https://github.com/Exoridus/ExoJS/tree/next/packages/exojs-tilemap-physics). For diagnostic drawing, use the package's `@codexo/exojs/debug` entry point.

## Documentation

[Physics guide](https://exoridus.github.io/ExoJS/en/guide/physics/physics-basics/) · [Joints and contact behavior](https://exoridus.github.io/ExoJS/en/guide/physics/joints-and-dynamics/) · [PhysicsWorld API](https://exoridus.github.io/ExoJS/en/api/physics-world/) · [Drag and Throw playground](https://exoridus.github.io/ExoJS/en/playground/?example=physics/sprite-follows-body) · [Kinematic Movement playground](https://exoridus.github.io/ExoJS/en/playground/?example=physics/kinematic-movement) · [Character movement guide](https://exoridus.github.io/ExoJS/en/guide/physics/character-movement/) · [Character Movement playground](https://exoridus.github.io/ExoJS/en/playground/?example=physics/character-movement)

## License

MIT © Codexo
