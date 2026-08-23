# @codexo/exojs-physics

Native 2D **rigid-body** runtime for [ExoJS](https://github.com/Exoridus/ExoJS).

Zero production dependencies, ESM-only, version-locked with the core engine.
It ships a fixed-step world with a warm-started **TGS-Soft** solver: shapes,
colliders, bodies, a dynamic-AABB broad phase, a manifold-generating narrow
phase, joints, sleeping islands, continuous collision for fast bodies, a
per-contact modifier, collision filters, sensors, events, spatial queries,
scene-node binding with interpolation, and a debug overlay.

> **Library, not an extension.** Physics contributes no renderer or asset
> bindings, so there is no `/register` entry. Construct a `PhysicsWorld`
> directly. `@codexo/exojs` is a peer dependency.

## Install

```sh
npm install @codexo/exojs @codexo/exojs-physics
```

## Quick start

```ts
import { Scene, Sprite, Vector, type Time } from '@codexo/exojs';
import { BoxShape, CircleShape, Collider, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

class GameScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: new Vector(0, 980) });

  public override onStart(): void {
    // Construct bodies/colliders freely, then hand them to the world: `add`
    // assigns ids, registers the colliders and aggregates the mass model.
    // Static ground (an explicit static body + box collider).
    this.world.add(
      new PhysicsBody({ type: 'static', position: new Vector(400, 600), colliders: [new Collider({ shape: new BoxShape(800, 32), friction: 0.9 })] }),
    );

    // A kinematic platform you move yourself. Attach more colliders any time.
    const platform = new PhysicsBody({ type: 'kinematic', position: new Vector(200, 400) });
    platform.addCollider(new Collider({ shape: new BoxShape(120, 16) }));
    this.world.add(platform);

    // A sensor trigger.
    const triggerCollider = new Collider({ shape: new CircleShape(40), isSensor: true });
    this.world.add(new PhysicsBody({ type: 'static', position: new Vector(600, 500), colliders: [triggerCollider] }));
    this.world.onSensorEnter.add(({ sensor }) => {
      if (sensor === triggerCollider) console.log('entered the trigger');
    });
  }

  public override update(delta: Time): void {
    this.world.step(delta.seconds); // fixed-step detection + events + binding
  }
}
```

## What it does

| Area | API |
|---|---|
| World | `PhysicsWorld`, `step`, `gravity`, `timeStepper`, `destroy` |
| Bodies | `new PhysicsBody` + `world.add` (`dynamic`/`static`/`kinematic`), `setTransform`, mass/inertia from colliders |
| Colliders | `new Collider` + `body.addCollider` / `colliders: [...]`, density/friction/restitution, `isSensor`, filter, offset |
| Attach | `world.attach(node, def)` — body + collider + `bind` in one call |
| Shapes | solid: `CircleShape`, `CapsuleShape`, `PolygonShape` (convex-validated), `BoxShape`; boundary: `SegmentShape`, `ChainShape` |
| Dynamics | fixed-step TGS-Soft solver, gravity, forces/impulses, friction/restitution, sleeping islands |
| Joints | `DistanceJoint`, `RevoluteJoint`, `PrismaticJoint`, `WheelJoint`, `WeldJoint`, `MouseJoint` |
| Continuous collision | `body.isBullet` — exact translational shape cast of the whole shape, not just its centre |
| Contact policy | `world.contactModifier` — per-contact material/enable decisions (one-way platforms, conditional friction) |
| Filtering | `CollisionFilter` (category/mask/group), `shouldCollide` |
| Events | `onCollisionStart` / `onCollisionEnd` / `onSensorEnter` / `onSensorExit` — immutable snapshots |
| Queries | `queryPoint`, `queryAabb` (+ `out` / `forEachAabbHit`), `rayCast`, `rayCastAll`, `overlapShape` |
| Binding | `bind(body, node)` — node tracks the body's position each step |
| Debug | `@codexo/exojs-physics/debug` → `PhysicsDebugDraw` (shapes/AABBs/contacts/normals/centres/broad-phase/joints) |

## Determinism & non-goals

Stepping is fully **caller-driven** and uses a fixed timestep with an
accumulator (`world.step(frameDeltaSeconds)`); the same build replays a scene
identically given the same inputs. There are **no rollback/lockstep determinism
guarantees across builds or machines** (floating-point reality). The package is
single-threaded and 2D only — no workers, GPU, 3D, soft bodies, fluids or
vehicles.

`step()` owns its own fixed-timestep accumulator, so you can drive it from
either the engine's `Scene.fixedUpdate` (already a constant-rate hook — the
idiomatic choice) or straight from `Scene.update`'s raw, variable per-frame
delta; either way `step` converts whatever it's given into the right number of
fixed sub-steps. See the "Stepping the world" section of the
[physics guide](https://exoridus.github.io/ExoJS/en/guide/physics/physics-basics/)
for the details and an interpolation note (`world.timeStepper.alpha`).

**Broad-phase scale.** Collision detection uses a dynamic AABB tree
(Box2D-style), incrementally updated across steps: a collider whose AABB
stays within its stored margin is never reinserted, so the dominant cost
tracks how much actually moved rather than the total live collider count
(there's still a cheap linear pass over all live colliders each step). Scales
to tens of thousands of simultaneously-live colliders.

**Solid and boundary geometry.** `CircleShape`, `CapsuleShape`, `PolygonShape`
and `BoxShape` enclose an area and carry mass; `SegmentShape` and `ChainShape`
are boundaries with no interior, so they contribute collision only and a
`dynamic` body needs at least one solid collider alongside them. A chain is one
authored collider that the engine solves edge by edge with shared-vertex
adjacency, so a body slides across a seam without snagging. Two boundaries never
collide with each other, and a boundary is never the *moving* operand of a
continuous shape cast — level structure is swept against, not swept.

## License

MIT © Codexo
