# @codexo/exojs-physics

Native 2D **collision, query and sensor** runtime for [ExoJS](https://github.com/Exoridus/ExoJS).

Zero production dependencies, ESM-only, version-locked with the core engine. This
first release ships a complete **collision/query world without dynamics**:
shapes, colliders, bodies, a broad phase, a manifold-generating narrow phase,
collision filters, sensors, events, spatial queries, scene-node binding and a
debug overlay. Forces, impulses and gravity integration (the rigid-body solver)
arrive in a follow-up — the public surface here is forward-compatible with it.

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
| Shapes | `CircleShape`, `PolygonShape` (convex-validated), `BoxShape` |
| Filtering | `CollisionFilter` (category/mask/group), `shouldCollide` |
| Events | `onCollisionStart` / `onCollisionEnd` / `onSensorEnter` / `onSensorExit` — immutable snapshots |
| Queries | `queryPoint`, `queryAabb` (+ `out` / `forEachAabbHit`), `rayCast`, `rayCastAll`, `overlapShape` |
| Binding | `bind(body, node)` — node tracks the body's position each step |
| Debug | `@codexo/exojs-physics/debug` → `PhysicsDebugDraw` (shapes/AABBs/contacts/normals/centres/broad-phase) |

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
stays within its stored margin is never re-touched, so cost tracks how much
actually moved rather than the total live collider count. Scales to tens of
thousands of simultaneously-live colliders.

This release contains **no dynamics solver**: bodies move only via
`setTransform`. The narrow phase already produces full contact manifolds (normal,
1–2 points, stable feature ids) so the solver can be added without changing the
public API.

## License

MIT © Codexo
